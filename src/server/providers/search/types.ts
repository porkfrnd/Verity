import type { SearchOptions, SearchResultItem } from "../../../shared/types.js";

export interface SearchProvider {
  id: string;
  search(query: string, opts?: SearchOptions): Promise<SearchResultItem[]>;
}
