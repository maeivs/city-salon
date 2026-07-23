export interface CreateUserBody {
    name: string;
    email: string;
    status?: "active" | "inactive";
}

export interface UpdateUserBody {
    name?: string;
    email?: string;
    status?: "active" | "inactive";
}
