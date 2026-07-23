import type { FastifyInstance } from "fastify";
import { forwardAuth, getBootstrap } from "./handlers/index.ts";
import {
    getPasswordPolicy,
    type PasswordPolicyBody,
    updatePasswordPolicy,
} from "./handlers/passwordPolicy.ts";

export default async function authRoutes(app: FastifyInstance) {
    const auth = { preHandler: app.authRequired.bind(app) };

    app.get("/bootstrap", auth, getBootstrap);
    app.get("/password-policy", auth, getPasswordPolicy);
    app.patch<{ Body: PasswordPolicyBody }>(
        "/password-policy",
        auth,
        updatePasswordPolicy,
    );
    app.post<{ Body: PasswordPolicyBody }>(
        "/password-policy",
        auth,
        updatePasswordPolicy,
    );
    app.all("/", forwardAuth);
    app.all("/*", forwardAuth);
}
