import { router } from "../trpc";
import { catalogRouter } from "./catalog";
import { communityRouter } from "./community";
import { meRouter } from "./me";
import { premiumRouter } from "./premium";

export const appRouter = router({
  catalog: catalogRouter,
  me: meRouter,
  premium: premiumRouter,
  community: communityRouter,
});

export type AppRouter = typeof appRouter;
