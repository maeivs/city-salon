export interface ParsedDocument {
    docType: string;
    receipt?: ParsedReceipt;
    namecard?: ParsedNamecard;
    invoice?: ParsedInvoice;
    businessReg?: ParsedBusinessReg;
    idCard?: ParsedIdCard;
    driverLicense?: ParsedDriverLicense;
    facilityCard?: ParsedFacilityCard;
    careerCert?: ParsedCareerCert;
}

export interface ParsedReceipt {
    storeName?: string;
    storeAddr?: string;
    corpNum?: string;
    date?: string;
    totalAmount?: string;
    items?: ReceiptItem[];
    paymentType?: string;
    cardNumber?: string;
}

export interface ReceiptItem {
    name: string;
    quantity?: string;
    price?: string;
}

export interface ParsedNamecard {
    name?: string;
    company?: string;
    department?: string;
    title?: string;
    phone?: string[];
    email?: string[];
    address?: string;
    website?: string;
}

export interface ParsedInvoice {
    invoiceNum?: string;
    issuerCorpNum?: string;
    issuerName?: string;
    receiverCorpNum?: string;
    receiverName?: string;
    writeDate?: string;
    amountTotal?: string;
    taxTotal?: string;
    totalAmount?: string;
}

export interface ParsedBusinessReg {
    corpNum?: string;
    corpName?: string;
    ceoName?: string;
    address?: string;
    bizType?: string;
    bizClass?: string;
    openDate?: string;
}

export interface ParsedIdCard {
    name?: string;
    idNumber?: string;
    issueDate?: string;
    issuer?: string;
}

export interface ParsedDriverLicense {
    name?: string;
    idNumber?: string;
    licenseNum?: string;
    licenseType?: string;
    issueDate?: string;
    expiryDate?: string;
    issuer?: string;
}

export interface ParsedFacilityCard {
    buildingName?: string;
    address?: string;
    buildingUse?: string;
    structure?: string;
    area?: string;
    floorCount?: string;
    approvalDate?: string;
    owner?: string;
}

export interface ParsedCareerCert {
    name?: string;
    idNumber?: string;
    company?: string;
    department?: string;
    position?: string;
    joinDate?: string;
    leaveDate?: string;
    issueDate?: string;
    issuer?: string;
}
