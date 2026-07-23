export interface CreatePostBody {
    title: string;
    content: string;
    category?: string;
}

export interface UpdatePostBody {
    title?: string;
    content?: string;
    category?: string;
    status?: "draft" | "published";
}
