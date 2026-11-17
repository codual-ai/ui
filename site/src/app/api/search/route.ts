import { createSearchAPI } from "fumadocs-core/search/server";
import { searchIndexes } from "@/lib/search-index.ts";

// Built once into a static file; the search dialog downloads it and searches in the browser.
export const dynamic = "force-static";
export const revalidate = false;

export const { staticGET: GET } = createSearchAPI("simple", { indexes: searchIndexes() });
