import plugins, { Options } from "./plugins.ts";

import "lume/types.ts";

export type { Options } from "./plugins.ts";

function collectFiles(dir: URL, prefix = ""): string[] {
  const files: string[] = [];

  for (const entry of Deno.readDirSync(dir)) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryUrl = new URL(`${entry.name}${entry.isDirectory ? "/" : ""}`, dir);

    if (entry.isDirectory) {
      files.push(...collectFiles(entryUrl, relPath));
      continue;
    }

    files.push(relPath);
  }

  return files;
}

export default function (options: Partial<Options> = {}) {
  return (site: Lume.Site) => {
    site.use(plugins(options));

    const tutorialFiles = collectFiles(new URL("./src/tutorials/", import.meta.url))
      .map((file) => `tutorials/${file}`);

    const files = [
      "_includes/css/navbar.css",
      "_includes/css/page.css",
      "_includes/css/post-list.css",
      "_includes/css/post.css",
      "_includes/layouts/base.vto",
      "_includes/layouts/page.vto",
      "_includes/layouts/post.vto",
      "_includes/layouts/tutorial.vto",
      "posts/_data.yml",
      "_data.yml",
      "index.vto",
      ...tutorialFiles,
      "styles.css",
      "favicon.png",
      "js/main.js",
    ];

    for (const file of files) {
      site.remoteFile(file, import.meta.resolve(`./src/${file}`));
    }
  };
}
