export interface SearchUsersQuery {
    q?: string;
    status?: "active" | "inactive";
    limit?: number;
    offset?: number;
}
