import { toNodeHandler } from "h3/node";

import app from "./app";

import { devSetup } from "_/api:factory";

export default devSetup({
  requestHandler() {
    return toNodeHandler(app);
  },
  teardownHandler() {
    // close db connections, server sockets etc.
  },
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 UNHANDLED REJECTION");
  console.error("Reason:", reason);
  process.exit(1);
});
