import { defineConfig, fetchGenerator, honoGenerator, typeboxGenerator } from "@kosmojs/dev";

/**
 * Delivery-event webhooks (spec §3.4): backend only, deployed publicly.
 * base "/webhooks" + apiBase "/" puts routes directly under /webhooks (e.g. /webhooks/sendgrid).
 * */
export default defineConfig({
  base: "/webhooks",
  apiBase: "/",
  generators: [honoGenerator(), fetchGenerator(), typeboxGenerator()],
});
