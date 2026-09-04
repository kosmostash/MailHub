import { use } from "_/api";

/**
 * Define global middleware applied to all routes.
 * Can be overridden on a per-route basis using the slot key.
 * */
export default [
  use(async function useExample(event, next) {
    return next();
  }),
];
