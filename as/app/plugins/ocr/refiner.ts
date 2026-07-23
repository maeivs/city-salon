/**
 * Refiner — 추출된 텍스트 값을 비즈니스 형식으로 정제
 * PHP NaverClovaRefine 포팅
 */

export class Refiner {
    /** 값을 지정된 정제 타입에 따라 포맷팅한다 */
    refine(value: string, refineType: string): string {
        switch (refineType) {
            case "date":
                return this.refineDate(value);
            case "biz_num":
                return this.refineBizNum(value);
            case "id_num":
                return this.refineIdNum(value);
            case "phone":
                return this.refinePhone(value);
            case "driver_license":
                return this.refineDriverLicense(value);
            case "trim":
                return value.trim();
            default:
                return value;
        }
    }

    /** 다양한 날짜 형식을 YYYY-MM-DD로 정제 */
    private refineDate(value: string): string {
        value = value.trim();
        if (!value) return "";

        const digits = value.match(/\d+/g);
        if (!digits || digits.length < 3) return value;

        let year = digits[0];
        let month = digits[1];
        let day = digits[2];

        if (year.length === 2) year = "20" + year;
        if (month.length === 1) month = "0" + month;
        if (day.length === 1) day = "0" + day;

        return `${year}-${month}-${day}`;
    }

    /** 사업자등록번호를 000-00-00000 형식으로 정제 */
    private refineBizNum(value: string): string {
        value = value.trim();
        let digits = extractDigits(value);
        if (digits.length > 10) digits = digits.slice(0, 10);
        if (digits.length !== 10) return value.trim();
        return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    }

    /** 주민등록번호 뒤 7자리 마스킹 */
    private refineIdNum(value: string): string {
        value = value.trim();
        if (value.includes("*")) return value;

        const match = value.match(/(\d{6})-?(\d{7})/);
        if (match) return `${match[1]}-*******`;

        const digits = extractDigits(value);
        if (digits.length === 13) return `${digits.slice(0, 6)}-*******`;

        return value;
    }

    /** 전화번호를 표준 형식으로 정제 */
    private refinePhone(value: string): string {
        value = value.trim();
        const digits = extractDigits(value);
        if (!digits) return value;

        if (digits.length === 10 && digits.startsWith("02")) {
            return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
        }
        if (digits.length === 9 && digits.startsWith("02")) {
            return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
        }
        if (digits.length === 11 && digits.startsWith("010")) {
            return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        }
        if (digits.length === 11) {
            return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        }
        if (digits.length === 10) {
            return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        return value;
    }

    /** 운전면허번호 정제 */
    private refineDriverLicense(value: string): string {
        value = value.trim();
        if (!value) return "";

        // 이미 올바른 형식 (한글 지역코드 포함)
        if (/[가-힣]{1,3}\s*\d{2}-\d{2}-\d{6}-\d{2}/.test(value)) return value;

        const digits = extractDigits(value);
        if (digits.length === 12) {
            return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 10)}-${digits.slice(10)}`;
        }
        return value;
    }
}

/** 문자열에서 숫자만 추출 */
function extractDigits(s: string): string {
    return s.replace(/\D/g, "");
}
