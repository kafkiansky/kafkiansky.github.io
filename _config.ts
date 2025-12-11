import lume from "lume/mod.ts";
import plugins from "./plugins.ts";
import date from "lume/plugins/date.ts";

const site = lume({
    src: "./src",
});

site.use(plugins());
site.use(date());

export default site;
