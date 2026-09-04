import { onError } from "h3";

import appFactory, { routes } from "_/api:factory";
import defaultErrorHandler from "./errors";

export default appFactory(routes, ({ app }) => {
  app.use(onError(defaultErrorHandler));
});
