import { defineConfig, presetIcons, presetWind4 } from "unocss";

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({
      collections: {
        tabler: () => import("@iconify-json/tabler/icons.json").then((i) => i.default),
      },
      extraProperties: {
        display: "inline-block",
        "vertical-align": "-0.125em",
      },
    }),
  ],
  safelist: ["pill-pending", "pill-ready", "pill-sent", "pill-bounced", "pill-muted"],
  shortcuts: {
    btn: "inline-flex items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
    "btn-primary": "btn bg-blue-700 text-white hover:bg-blue-800",
    "btn-secondary": "btn bg-white text-gray-900 border-gray-300 hover:bg-gray-50",
    "btn-danger": "btn bg-red-700 text-white hover:bg-red-800",
    card: "rounded-lg border border-gray-200 bg-white p-4 shadow-sm",
    pill: "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
    "pill-pending": "pill bg-orange-100 text-orange-800",
    "pill-ready": "pill bg-blue-100 text-blue-800",
    "pill-sent": "pill bg-green-100 text-green-800",
    "pill-bounced": "pill bg-red-100 text-red-800",
    "pill-muted": "pill bg-gray-100 text-gray-700",
  },
});
