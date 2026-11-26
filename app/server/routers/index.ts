import { router } from "../trpc";
import { catalogRouter } from "./catalog";
import { communityRouter } from "./community";
import { meRouter } from "./me";
import { nouriRouter } from "./nouri";
import { premiumRouter } from "./premium";

export const appRouter = router({
  catalog: catalogRouter,
  me: meRouter,
  premium: premiumRouter,
  community: communityRouter,
  nouri: nouriRouter,
});

export type AppRouter = typeof appRouter;
