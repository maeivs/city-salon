#!/bin/bash

# @ehfuse 패키지들을 최신 버전으로 업데이트하는 스크립트
# - npm 레지스트리의 최신 버전 확인
# - node_modules의 실제 설치된 버전 확인
# - 버전 불일치 감지 및 업데이트

echo "=========================================="
echo "@ehfuse 패키지 업데이트 시작"
echo "=========================================="
echo ""

EHFUSE_PACKAGES=$(grep -o '"@ehfuse/[^"]*"' package.json | tr -d '"' | sort -u)

if [ -z "$EHFUSE_PACKAGES" ]; then
    echo "❌ @ehfuse 패키지를 찾을 수 없습니다."
    exit 1
fi

echo "📦 패키지 버전 확인:"
echo ""

NEED_UPDATE=false
TEMP_VERSIONS=$(mktemp)

while IFS= read -r pkg; do
    if [ -n "$pkg" ]; then
        # package.json 버전
        PKG_JSON_VERSION=$(grep "$pkg" package.json | grep -o '"[0-9^~@].*"' | tr -d '"' | head -1)
        
        # npm 레지스트리의 최신 버전
        NPM_LATEST=$(npm view "$pkg" version 2>/dev/null)
        
        # node_modules의 실제 설치된 버전
        INSTALLED=$(npm list "$pkg" --depth=0 2>/dev/null | grep "$pkg" | grep -o '@[0-9.]*' | tail -1 | cut -c2-)
        
        echo "  📌 $pkg"
        echo "     - package.json: $PKG_JSON_VERSION"
        echo "     - npm 최신: $NPM_LATEST"
        echo "     - 실제 설치: ${INSTALLED:-없음}"
        
        # npm 최신 버전과 비교
        if [ -n "$NPM_LATEST" ] && [ "$NPM_LATEST" != "$INSTALLED" ]; then
            echo "     ⚠️  업데이트 필요"
            NEED_UPDATE=true
        fi
        
        echo "$pkg|$PKG_JSON_VERSION|$NPM_LATEST|$INSTALLED" >> "$TEMP_VERSIONS"
    fi
done <<< "$EHFUSE_PACKAGES"

echo ""

if [ "$NEED_UPDATE" = false ]; then
    echo "✨ 모든 @ehfuse 패키지가 최신 버전입니다."
    rm -f "$TEMP_VERSIONS"
    exit 0
fi

echo "🔄 업데이트 진행 중..."
echo ""

PACKAGE_LIST=""
while IFS= read -r pkg; do
    if [ -n "$pkg" ]; then
        PACKAGE_LIST="$PACKAGE_LIST $pkg@latest"
    fi
done <<< "$EHFUSE_PACKAGES"

if [ -n "$PACKAGE_LIST" ]; then
    npm install $PACKAGE_LIST
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "=========================================="
        echo "✅ @ehfuse 패키지 업데이트 완료!"
        echo "=========================================="
        echo ""
        echo "📋 업데이트 결과:"
        
        UPDATED_COUNT=0
        while IFS='|' read -r pkg old_version npm_latest old_installed; do
            if [ -n "$pkg" ]; then
                NEW_INSTALLED=$(npm list "$pkg" --depth=0 2>/dev/null | grep "$pkg" | grep -o '@[0-9.]*' | tail -1 | cut -c2-)
                
                if [ "$old_installed" != "$NEW_INSTALLED" ]; then
                    echo "  ✓ $pkg: ${old_installed:-없음} → $NEW_INSTALLED"
                    UPDATED_COUNT=$((UPDATED_COUNT + 1))
                fi
            fi
        done < "$TEMP_VERSIONS"
        
        rm -f "$TEMP_VERSIONS"
        echo ""
        echo "✨ 총 $UPDATED_COUNT개의 패키지가 업데이트되었습니다."
    else
        echo ""
        echo "❌ 업데이트 중 오류가 발생했습니다."
        rm -f "$TEMP_VERSIONS"
        exit 1
    fi
fi

