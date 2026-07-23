/** configs/extensions/example.json 스키마 */
export interface ExampleConfig {
    enabled: boolean; // 확장 활성화 여부

    minify?: boolean; // 빌드 시 난독화 여부 (build:minify-plugins 적용 대상)

    // TODO: 추가 설정 필드를 여기에 선언합니다.
    // 예:
    // api_key: string;
    // endpoint: string;
}
