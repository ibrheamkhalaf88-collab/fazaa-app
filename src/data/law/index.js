import { CYBER_CRIMES_2018, LAW_NAME } from "./cyber-crimes-2018.js";

/**
 * Region codes used everywhere (state.country, proxy body, law registry).
 * @typedef {"ps-wb" | "ps-gaza"} Region
 */
export const REGIONS = /** @type {const} */ (["ps-wb", "ps-gaza"]);

/**
 * LAW REGISTRY: the single list of laws the app may cite.
 * Each law says WHERE it applies. Personal-status and criminal law differ between the
 * West Bank and Gaza, so a law is only shown/cited for the regions listed here.
 *
 * To add a law: create src/data/law/<name>.js (same shape as cyber-crimes-2018.js),
 * import it below and add one entry. Ids must be unique across ALL laws, so prefix new
 * ones (e.g. "psl-wb:12"). See docs/CONTENT.md.
 *
 * @type {{key:string, name:string, regions:Region[], articles:import("./cyber-crimes-2018.js").Article[]}[]}
 */
export const LAWS = [
  {
    key: "cyber-2018",
    name: LAW_NAME,
    // TODO(legal audit): confirm this decree-law is applied in Gaza before relying on it there.
    regions: ["ps-wb", "ps-gaza"],
    articles: CYBER_CRIMES_2018,
  },
];

/** Every article, tagged with its law and regions. Used for rendering a cited id. */
export const ARTICLES = Object.fromEntries(
  LAWS.flatMap((law) =>
    law.articles.map((a) => [a.id, { ...a, lawKey: law.key, lawName: law.name, regions: law.regions }]),
  ),
);

export const ARTICLE_IDS = Object.keys(ARTICLES);

/**
 * Only the articles that apply in `region`. Retrieval and citation validation must use
 * this, never ARTICLES, so a Gaza user is never shown (or quoted) a West-Bank-only law.
 * @param {string} region
 */
export function articlesFor(region) {
  return Object.fromEntries(Object.entries(ARTICLES).filter(([, a]) => a.regions.includes(region)));
}

export { LAW_NAME };

/**
 * Which articles are relevant to which detected intent. Ids missing for the user's
 * region are skipped by retrieval, so one map serves both regions.
 */
export const INTENT_TO_ARTICLES = {
  blackmail: ["15"],
  porn: ["16"],
  privacy: ["22"],
  minor: ["52"],
};
