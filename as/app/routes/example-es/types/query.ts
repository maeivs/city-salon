export interface SearchPostsQuery {
    q?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
    orderBy?: string;
    orderDir?: "ASC" | "DESC";
}

export interface HistoryQuery {
    page?: number;
    limit?: number;
}
