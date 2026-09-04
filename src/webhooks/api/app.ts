import appFactory, { routes } from "_/api:factory";
import defaultErrorHandler from "./errors";

export default appFactory(routes, ({ app }) => {
  app.onError(defaultErrorHandler);
})
