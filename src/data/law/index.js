import { BASIC_LAW_2003, BASIC_LAW_NAME } from "./basic-law-2003.js";
import { CYBER_CRIMES_2018, LAW_NAME } from "./cyber-crimes-2018.js";
import { FAMILY_GAZA_1954, FAMILY_GAZA_NAME } from "./family-rights-gaza-1954.js";
import { PSL_WB_1976, PSL_WB_NAME } from "./personal-status-wb-1976.js";

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
  {
    // Personal status differs by region: the West Bank applies the 1976 law, Gaza the 1954 family-rights law.
    key: "psl-wb-1976",
    name: PSL_WB_NAME,
    regions: ["ps-wb"],
    articles: PSL_WB_1976,
  },
  {
    key: "family-gaza-1954",
    name: FAMILY_GAZA_NAME,
    regions: ["ps-gaza"],
    articles: FAMILY_GAZA_1954,
  },
  {
    key: "basic-law-2003",
    name: BASIC_LAW_NAME,
    regions: ["ps-wb", "ps-gaza"],
    articles: BASIC_LAW_2003,
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
  // personal status: West Bank ids ("psl:") and Gaza ids ("gz:"); retrieval keeps only the user's region
  nafaqa: ["psl:66", "psl:73", "psl:168", "psl:74", "psl:67", "psl:70", "gz:59", "gz:38", "gz:61", "gz:65"],
  divorce: [
    "psl:132",
    "psl:134",
    "psl:101",
    "psl:102",
    "psl:127",
    "psl:123",
    "psl:130",
    "psl:135",
    "psl:146",
    "psl:79",
    "psl:61",
    "gz:92",
    "gz:94",
    "gz:77",
    "gz:55",
    "gz:66",
  ],
  custody: ["psl:154", "psl:155", "psl:157", "psl:163"], // Gaza custody text is not in the corpus yet
};
