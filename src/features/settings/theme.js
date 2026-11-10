import { $, $$ } from "../../core/dom.js";

const THEME_COLOR = { light: "#AEBBD3", dark: "#121935" }; // browser UI colour (matches --ground)

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

    for (const button of $$("[data-theme-set]")) {
      const on = button.getAttribute("data-theme-set") === theme;
      button.classList.toggle("on", on);
      button.setAttribute("aria-checked", String(on));
    }
    $('meta[name="theme-color"]')?.setAttribute("content", isDark() ? THEME_COLOR.dark : THEME_COLOR.light);
  }

  // while on "auto", react when the system switches between light and dark
  media?.addEventListener?.("change", () => state.get("theme") === "auto" && apply());

  return { apply, isDark };
}
