import date, { Options as DateOptions } from "lume/plugins/date.ts";
import postcss from "lume/plugins/postcss.ts";
import prism, { Options as PrismOptions } from "lume/plugins/prism.ts";
import basePath from "lume/plugins/base_path.ts";
import slugifyUrls from "lume/plugins/slugify_urls.ts";
import resolveUrls from "lume/plugins/resolve_urls.ts";
import metas from "lume/plugins/metas.ts";
import pagefind, { Options as PagefindOptions } from "lume/plugins/pagefind.ts";
import sitemap from "lume/plugins/sitemap.ts";
import feed, { Options as FeedOptions } from "lume/plugins/feed.ts";
import readingInfo from "lume/plugins/reading_info.ts";
import { merge } from "lume/core/utils/object.ts";
import toc from "https://deno.land/x/lume_markdown_plugins@v0.9.0/toc.ts";
import image from "https://deno.land/x/lume_markdown_plugins@v0.9.0/image.ts";
import footnotes from "https://deno.land/x/lume_markdown_plugins@v0.9.0/footnotes.ts";
import icons from "lume/plugins/icons.ts";
import googleFonts from "lume/plugins/google_fonts.ts";
import "npm:prismjs@1.29.0/components/prism-less.js";
import "npm:prismjs@1.29.0/components/prism-git.js";
import "npm:prismjs@1.29.0/components/prism-clike.js";
import "npm:prismjs@1.29.0/components/prism-markup-templating.js";
import "npm:prismjs@1.29.0/components/prism-php.js";
import "npm:prismjs@1.29.0/components/prism-go.js";

import "lume/types.ts";

export interface Options {
    prism?: Partial<PrismOptions>;
    date?: Partial<DateOptions>;
    pagefind?: Partial<PagefindOptions>;
    feed?: Partial<FeedOptions>;
}

export const defaults: Options = {
    prism: {
        languages: ["php", "go"],
        css: "prism.css",
        js: "prism.js",
    },
    feed: {
        output: ["/feed.xml", "/feed.json"],
        query: "type=post",
        limit: 10,
        info: {
            title: "=metas.site",
            description: "=metas.description",
            generator: false,
        },
        items: {
            title: "=title",
        },
    },
};

export default function (userOptions?: Options) {
    const options = merge(defaults, userOptions);

    return (site: Lume.Site) => {
        site.use(postcss())
            .use(basePath())
            .use(toc())
            .use(prism(options.prism))
            .use(readingInfo())
            .use(date(options.date))
            .use(metas())
            .use(image())
            .use(footnotes())
            .use(resolveUrls())
            .use(slugifyUrls())
            .use(pagefind(options.pagefind))
            .use(sitemap())
            .use(feed(options.feed))
            .use(icons({
                catalogs: [
                    {
                        id: "feather",
                        src: "https://cdn.jsdelivr.net/npm/feather-icons@4.29.2/dist/icons/{name}.svg"
                    },
                ]
            }))
            .use(googleFonts({
                cssFile: "styles.css",
                placeholder: "/* google-fonts */",
                fonts: {
                    code: "https://fonts.google.com/share?selection.family=JetBrains+Mono:ital,wght@0,100..800;1,100..800",
                    menu: "https://fonts.google.com/share?selection.family=IBM+Plex+Sans:ital,wght@0,100..700;1,100..700",
                    header: "https://fonts.google.com/share?selection.family=JetBrains+Mono:ital,wght@0,100..800;1,100..800",
                    content: "https://fonts.google.com/share?selection.family=Merriweather:ital,opsz,wght@0,18..144,300..900;1,18..144,300..900"
                },
            }))
            .add("fonts")
            .add([".css"])
            .add("js")
            .add("favicon.png")
            .add("uploads")
            .mergeKey("extra_head", "stringArray")
            .preprocess([".md"], (pages) => {
                for (const page of pages) {
                    page.data.excerpt ??= (page.data.content as string).split(
                        /<!--\s*more\s*-->/i,
                    )[0];
                }
            });
    };
}
