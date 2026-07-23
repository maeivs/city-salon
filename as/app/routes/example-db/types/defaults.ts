import type { CreateUserBody, UpdateUserBody } from "./user.ts";
import type { SearchUsersQuery } from "./query.ts";

export const defaultCreateUserBody: CreateUserBody = {
    name: "",
    email: "",
    status: "active",
};

export const defaultUpdateUserBody: UpdateUserBody = {
    name: undefined,
    email: undefined,
    status: undefined,
};

export const defaultSearchUsersQuery: SearchUsersQuery = {
    q: undefined,
    status: undefined,
    limit: 20,
    offset: 0,
};
