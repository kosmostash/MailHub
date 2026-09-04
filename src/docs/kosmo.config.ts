import { defineConfig, mdxGenerator, ssrGenerator } from "@kosmojs/dev";
import frontmatterPlugin from "remark-frontmatter";
import mdxFrontmatterPlugin from "remark-mdx-frontmatter";

export default defineConfig({
  base: "/",
  generators: [
    mdxGenerator({ remarkPlugins: [frontmatterPlugin, mdxFrontmatterPlugin] }),
    ssrGenerator(),
  ],
});
