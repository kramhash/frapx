import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

// The site has no Starlight locales: English is the source of truth and only
// a few entry pages are translated, under ja/. Mark their content as Japanese
// so browsers pick Japanese glyphs and fonts; the site chrome stays English.
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  if (route.id.startsWith("ja/")) {
    route.entryMeta.lang = "ja";
  }
});
