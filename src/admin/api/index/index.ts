import { defineRoute } from "_/api";

export default defineRoute<"index">(({ GET }) => [
  GET(async (event) => {
    return "Automatically generated route";
  }),
]);
