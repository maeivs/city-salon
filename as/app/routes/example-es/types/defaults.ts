import type { CreatePostBody, UpdatePostBody } from "./post.ts";
import type { SearchPostsQuery, HistoryQuery } from "./query.ts";

export const defaultCreatePostBody: CreatePostBody = {
    title: "",
    content: "",
    category: "general",
};

export const defaultUpdatePostBody: UpdatePostBody = {
    title: undefined,
    content: undefined,
    category: undefined,
    status: undefined,
};

export const defaultSearchPostsQuery: SearchPostsQuery = {
    q: undefined,
    category: undefined,
    status: undefined,
    page: 1,
    limit: 20,
    orderBy: undefined,
    orderDir: "DESC",
};

export const defaultHistoryQuery: HistoryQuery = {
    page: 1,
    limit: 10,
};
