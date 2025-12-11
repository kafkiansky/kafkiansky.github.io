import lume from "lume/mod.ts";
import plugins from "./plugins.ts";
import date from "lume/plugins/date.ts";

const site = lume({
    src: "./src",
});

site.use(plugins());
site.use(date());

site.addEventListener("afterLoad", () => {
    const posts = site.pages.filter((p) => p.data.url?.includes("/posts/") && p.data.date);

    const groups: Record<string, any[]> = {};
    for (const post of posts) {
        const d = post.data.date instanceof Date ? post.data.date : new Date(post.data.date);
        const year = String(d.getFullYear());

        const data = {
            ...post.data,
            date: d,
        };

        (groups[year] ??= []).push(data);
    }

    for (const year of Object.keys(groups)) {
        groups[year].sort((a, b) => b.date.getTime() - a.date.getTime());
    }

    const years = Object.keys(groups).map(Number).sort((a, b) => b - a).map(String);

    site.data("years", years);
    site.data("posts", groups);
});

export default site;
