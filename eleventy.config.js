import { load as yamlLoad } from "js-yaml";

export default function (eleventyConfig) {
  // Inhalte liegen als YAML in src/_data (werden über Pages CMS bearbeitet)
  eleventyConfig.addDataExtension("yml,yaml", (contents) => yamlLoad(contents));

  // Dateien 1:1 übernehmen
  for (const p of ["src/assets", "src/img", "src/favicon.svg", "src/favicon.png", "src/apple-touch-icon.png", "src/og-image.png", "src/CNAME", "src/robots.txt", "src/.nojekyll"]) {
    eleventyConfig.addPassthroughCopy(p);
  }
  // Weiterleitungen der alten URLs (/about, /pricing …)
  eleventyConfig.addPassthroughCopy({ "src/redirects": "/" });

  // 59.99 → "59,99 €"
  const euro = (n) =>
    Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  eleventyConfig.addFilter("euro", euro);

  // Preistext eines Pakets: "59,99 €", "ab 299,99 €" oder "auf Anfrage"
  eleventyConfig.addFilter("preistext", (p) =>
    p.preis === null || p.preis === undefined || p.preis === "" ? "auf Anfrage" : (p.ab ? "ab " : "") + euro(p.preis)
  );

  // Eindeutiger Name eines Pakets fürs Formular, z. B. "Innen Comfort (79,99 €)"
  eleventyConfig.addFilter("anfragename", (p, kat) => {
    const pre = kat.praefix ? kat.praefix + " " : "";
    const preis = p.preis === null || p.preis === undefined || p.preis === "" ? "auf Anfrage" : (p.ab ? "ab " : "") + euro(p.preis);
    return `${pre}${p.name} (${preis})`;
  });

  // Telefonnummer für tel:-Links (Leerzeichen raus)
  eleventyConfig.addFilter("tel", (s) => String(s).replace(/[^\d+]/g, ""));

  // Zeilenumbrüche aus Textfeldern als Absätze
  eleventyConfig.addFilter("absaetze", (s) =>
    String(s || "")
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean)
  );

  eleventyConfig.addFilter("jahr", () => new Date().getFullYear());

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md"],
  };
}
