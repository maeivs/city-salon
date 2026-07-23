/** Vite define으로 주입되는 process.env 전역 타입 선언 */
declare const process: {
    env: {
        NODE_ENV?: string;
        HOME?: string;
        USER?: string;
        [key: string]: string | undefined;
    };
};
