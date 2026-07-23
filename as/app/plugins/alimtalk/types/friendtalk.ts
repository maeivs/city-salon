import type { AlimtalkButton } from "./job.ts";

export const FRIENDTALK_TYPE_TEXT = "text";
export const FRIENDTALK_TYPE_IMAGE = "image";
export const FRIENDTALK_TYPE_WIDE_IMAGE = "wide_image";
export const FRIENDTALK_TYPE_WIDE_ITEM_LIST = "wide_item_list";
export const FRIENDTALK_TYPE_CAROUSEL = "carousel";

export interface FriendTalkJob {
    provider: string;
    msgType: string;
    receiver: string;
    content: string;
    imageUrl: string;
    imageLink: string;
    isAd: boolean;
    buttonsJSON: string;
    carouselJSON: string;
    itemsJSON: string;
    header: string;
    refEntity: string;
    refSeq: number;
    msgSeq: number;
}

export interface PendingFriendTalkLog {
    logSeq: number;
    provider: string;
    msgType: string;
    receiver: string;
    content: string;
    imageUrl: string;
    imageLink: string;
    isAd: boolean;
    buttonsJSON: string;
    carouselJSON: string;
    itemsJSON: string;
    header: string;
    retryCount: number;
    msgSeq: number;
}

export interface FriendTalkRequest {
    senderKey: string;
    msgType: string;
    receiver: string;
    content: string;
    imageUrl: string;
    imageLink: string;
    isAd: boolean;
    buttons: AlimtalkButton[];
    header: string;
    items: FriendTalkItem[];
    carousel?: FriendTalkCarousel;
}

export interface FriendTalkItem {
    title: string;
    image_url: string;
    link_mobile: string;
    link_pc?: string;
    scheme_ios?: string;
    scheme_android?: string;
}

export interface FriendTalkCarousel {
    items: FriendTalkCarouselItem[];
    tail?: FriendTalkLink;
}

export interface FriendTalkCarouselItem {
    header: string;
    message: string;
    image_url: string;
    image_link?: string;
    buttons?: AlimtalkButton[];
}

export interface FriendTalkLink {
    link_mobile: string;
    link_pc?: string;
    scheme_ios?: string;
    scheme_android?: string;
}

export interface FriendTalkResult {
    providerMsgId: string;
    statusCode: string;
    requestId: string;
}
