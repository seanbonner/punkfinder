export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("data");
  // Keep the build spec and any docs out of the built site.
  eleventyConfig.ignores.add("docs/**");
  eleventyConfig.ignores.add("*-spec.md");
  eleventyConfig.ignores.add("README.md");
  // Cloudflare Pages Functions live in functions/ and are handled by Pages,
  // not Eleventy — don't let Eleventy pick up the .js files as templates.
  eleventyConfig.ignores.add("functions/**");

  eleventyConfig.addFilter("shortWallet", (wallet) => {
    if (!wallet || typeof wallet !== "string") return "";
    return wallet.length > 10 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
  });

  return {
    dir: { input: ".", includes: "_includes", data: "_data", output: "_site" },
    templateFormats: ["njk", "md", "html", "11ty.js"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
