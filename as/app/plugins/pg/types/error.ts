import { AppError, NotFoundError, ConflictError } from "@system/api";

export class PgError extends AppError {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(`pg error [${code}]: ${message}`, 500, code);
        this.name = "PgError";
    }
}

export class PgNotFoundError extends NotFoundError {
    constructor(message: string) {
        super(message);
        this.name = "PgNotFoundError";
    }
}

export class PgConflictError extends ConflictError {
    constructor(message: string) {
        super(message);
        this.name = "PgConflictError";
    }
}
