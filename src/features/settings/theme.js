import { $, $$ } from "../../core/dom.js";

/**
 * The app's palette, fixed by the owner on 2026-11-19: "fresh" (white, green, orange; styles/palette-fresh.css).
 * The original palette is kept in tokens.css: set this to "classic" to bring it back.
 */
const PALETTE = "fresh";

// browser UI colour (matches --ground of each palette)
const THEME_COLOR = {
  classic: { light: "#AEBBD3", dark: "#121935" },
  fresh: { light: "#F3F8F4", dark: "#0F1F16" },
};

/**
 * Apply the chosen theme. "auto" follows the system; "light"/"dark" force it via
 * <html data-theme>, which tokens.css reacts to.
 *
 * @param {ReturnType<import("../../core/state.js").createState>} state
 */
export function createTheme(state) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  const isDark = () => state.get("theme") === "dark" || (state.get("theme") === "auto" && !!media?.matches);

  function apply() {
    const theme = state.get("theme");
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const palette = PALETTE;
    root.toggleAttribute("data-palette", palette !== "classic");
    if (palette !== "classic") root.setAttribute("data-palette", palette);

    for (const button of $$("[data-theme-set]")) {
      const on = button.getAttribute("data-theme-set") === theme;
      button.classList.toggle("on", on);
      button.setAttribute("aria-checked", String(on));
    }
    const colors = THEME_COLOR[palette];
    $('meta[name="theme-color"]')?.setAttribute("content", isDark() ? colors.dark : colors.light);
  }

  // while on "auto", react when the system switches between light and dark
  media?.addEventListener?.("change", () => state.get("theme") === "auto" && apply());

  return { apply, isDark };
}
