#!/usr/bin/env python3
"""
dark: 클래스 패턴을 스타일 상수로 교체하는 스크립트
"""

import re
import os
import glob
from pathlib import Path

# 긴 패턴부터 먼저 매칭되도록 길이순 정렬 보장
REPLACEMENTS = {
    # TEXT_COLOR
    'text-gray-900 dark:text-white': 'TEXT_COLOR.strong',
    'text-gray-500 dark:text-gray-400': 'TEXT_COLOR.subtle',
    'text-gray-600 dark:text-gray-400': 'TEXT_COLOR.tertiary',
    'text-gray-400 dark:text-gray-500': 'TEXT_COLOR.dim',
    'text-gray-600 dark:text-white/60': 'TEXT_COLOR.alphaLight',
    'text-gray-700 dark:text-gray-200': 'TEXT_COLOR.bright',
    'text-gray-600 dark:text-gray-300': 'TEXT_COLOR.softMuted',
    'text-gray-900 dark:text-gray-300': 'TEXT_COLOR.strongMuted',
    'text-gray-900 dark:text-gray-100': 'TEXT_COLOR.primary',
    'text-gray-700 dark:text-gray-300': 'TEXT_COLOR.secondary',
    'text-gray-400 dark:text-gray-600': 'TEXT_COLOR.disabled',
    'text-gray-500 dark:text-gray-500': 'TEXT_COLOR.muted',
    'text-gray-400 dark:text-white/40': 'TEXT_COLOR.dimAlpha',
    'text-gray-500 dark:text-white/50': 'TEXT_COLOR.dimAlphaLight',
    'text-gray-800 dark:text-gray-200': 'TEXT_COLOR.darker',
    'text-gray-300 dark:text-gray-600': 'TEXT_COLOR.dimInvert',
    'text-gray-700 dark:text-gray-400': 'TEXT_COLOR.tertiaryMid',
    'text-amber-600 dark:text-amber-400': 'TEXT_COLOR.amber',
    'text-purple-600 dark:text-purple-400': 'TEXT_COLOR.purple',
    'text-purple-800 dark:text-purple-200': 'TEXT_COLOR.purpleDeep',
    # Status TEXT
    'text-green-600 dark:text-green-400': 'TEXT_COLOR.success',
    'text-green-700 dark:text-green-300': 'TEXT_COLOR.successStrong',
    'text-green-800 dark:text-green-200': 'TEXT_COLOR.successDeep',
    'text-yellow-600 dark:text-yellow-400': 'TEXT_COLOR.warning',
    'text-yellow-800 dark:text-yellow-200': 'TEXT_COLOR.warningDeep',
    'text-red-600 dark:text-red-400': 'TEXT_COLOR.error',
    'text-red-500 dark:text-red-400': 'TEXT_COLOR.errorMid',
    'text-red-700 dark:text-red-300': 'TEXT_COLOR.errorStrong',
    'text-red-800 dark:text-red-200': 'TEXT_COLOR.errorDeep',
    'text-blue-600 dark:text-blue-400': 'TEXT_COLOR.info',
    'text-blue-800 dark:text-blue-200': 'TEXT_COLOR.infoDeep',
    'text-orange-600 dark:text-orange-400': 'TEXT_COLOR.orange',
    'text-orange-700 dark:text-orange-400': 'TEXT_COLOR.orangeStrong',
    'text-yellow-800 dark:text-yellow-300': 'TEXT_COLOR.warningMid',
    'text-yellow-700 dark:text-yellow-300': 'TEXT_COLOR.warningStrong',
    # Hover TEXT
    'hover:text-gray-700 dark:hover:text-gray-300': 'TEXT_COLOR.hoverSecondary',
    'hover:text-gray-600 dark:hover:text-gray-300': 'TEXT_COLOR.hoverTertiary',
    'hover:text-gray-900 dark:hover:text-gray-200': 'TEXT_COLOR.hoverStrong',
    'hover:text-gray-900 dark:hover:text-white': 'TEXT_COLOR.hoverStrongest',
    'hover:text-red-600 dark:hover:text-red-400': 'TEXT_COLOR.hoverError',

    # BG_COLOR
    'bg-gray-200 dark:bg-gray-700': 'BG_COLOR.medium',
    'bg-gray-100 dark:bg-gray-800': 'BG_COLOR.lightDark',
    'bg-white dark:bg-gray-700': 'BG_COLOR.whiteDark',
    'bg-white dark:bg-gray-900': 'BG_COLOR.darker',
    'bg-gray-300 dark:bg-gray-600': 'BG_COLOR.strong',
    'bg-gray-50 dark:bg-gray-700/50': 'BG_COLOR.grayHalf',
    'bg-red-100 dark:bg-red-900/30': 'BG_COLOR.errorLight',
    'bg-gray-50 dark:bg-gray-800': 'BG_COLOR.grayDark',
    'bg-orange-50 dark:bg-orange-900/20': 'BG_COLOR.orange',
    'bg-green-100 dark:bg-green-900/30': 'BG_COLOR.successLight',
    'bg-orange-100 dark:bg-orange-900/30': 'BG_COLOR.orangeLight',
    'bg-white dark:bg-gray-800': 'BG_COLOR.white',
    'bg-gray-50 dark:bg-gray-900': 'BG_COLOR.gray',
    'bg-gray-100 dark:bg-gray-700': 'BG_COLOR.light',
    'bg-gray-50 dark:bg-gray-700': 'BG_COLOR.grayLighter',
    'bg-gray-300 dark:bg-gray-700': 'BG_COLOR.mediumStrong',
    'bg-gray-300/30 dark:bg-gray-700/30': 'BG_COLOR.weakMedium',
    'bg-gray-200/50 dark:bg-gray-800/50': 'BG_COLOR.weakLight',
    'bg-white dark:bg-white/5': 'BG_COLOR.whiteAlpha',
    'bg-red-50 dark:bg-red-900/20': 'BG_COLOR.error',
    'bg-red-100 dark:bg-red-900': 'BG_COLOR.errorMedium',
    'bg-green-50 dark:bg-green-900/20': 'BG_COLOR.success',
    'bg-green-100 dark:bg-green-900': 'BG_COLOR.successMedium',
    'bg-yellow-50 dark:bg-yellow-900/20': 'BG_COLOR.warning',
    'bg-yellow-50 dark:bg-yellow-900/30': 'BG_COLOR.warningLight',
    'bg-blue-50 dark:bg-blue-900/20': 'BG_COLOR.info',
    'bg-blue-50 dark:bg-blue-900/30': 'BG_COLOR.infoLight',
    'bg-blue-100 dark:bg-blue-900/30': 'BG_COLOR.infoLighter',
    'bg-blue-100 dark:bg-blue-900': 'BG_COLOR.infoMedium',
    'bg-orange-100 dark:bg-orange-900': 'BG_COLOR.orangeMedium',
    'bg-purple-50 dark:bg-purple-900/20': 'BG_COLOR.purple',
    'bg-purple-100 dark:bg-purple-900/30': 'BG_COLOR.purpleLight',
    'bg-orange-50 dark:bg-orange-900/30': 'BG_COLOR.orangeWarm',
    'bg-gray-300/50 dark:bg-gray-700/50': 'BG_COLOR.grayTranslucent',
    # Hover BG
    'hover:bg-gray-50 dark:hover:bg-gray-800/50': 'BG_COLOR.hoverGrayDeep',
    'hover:bg-gray-300 dark:hover:bg-gray-600': 'BG_COLOR.hoverStronger',
    'hover:bg-red-50 dark:hover:bg-red-900/20': 'BG_COLOR.hoverError',
    'hover:bg-red-100 dark:hover:bg-red-900/30': 'BG_COLOR.hoverErrorLight',
    'hover:bg-orange-50 dark:hover:bg-orange-900/20': 'BG_COLOR.hoverOrange',
    'hover:bg-gray-50 dark:hover:bg-gray-800': 'BG_COLOR.hoverGrayDark',
    'hover:bg-blue-50 dark:hover:bg-blue-900/20': 'BG_COLOR.hoverBlue',
    'hover:bg-white dark:hover:bg-gray-700': 'BG_COLOR.hoverWhite',
    # hover
    'hover:bg-gray-50 dark:hover:bg-gray-700/50': 'BG_COLOR.hoverLight',
    'hover:bg-gray-100 dark:hover:bg-gray-700': 'BG_COLOR.hoverGray',
    'hover:bg-gray-200 dark:hover:bg-gray-600': 'BG_COLOR.hoverDark',
    'hover:bg-gray-200 dark:hover:bg-gray-700': 'BG_COLOR.hoverMedium',
    'hover:bg-gray-100 dark:hover:bg-gray-800': 'BG_COLOR.hoverLightDark',
    'hover:bg-gray-50 dark:hover:bg-gray-700': 'BG_COLOR.hoverLighter',
    'hover:bg-gray-50 dark:hover:bg-gray-600': 'BG_COLOR.hoverLighterDark',

    # BORDER_COLOR
    'border-gray-300 dark:border-gray-700': 'BORDER_COLOR.strong',
    'border-gray-300/50 dark:border-gray-700/50': 'BORDER_COLOR.softDark',
    'border-orange-200 dark:border-orange-800': 'BORDER_COLOR.orange',
    'border-gray-300 dark:border-gray-500': 'BORDER_COLOR.stronger',
    'border-gray-200 dark:border-gray-800': 'BORDER_COLOR.deeper',
    'border-gray-200 dark:border-gray-700': 'BORDER_COLOR.default',
    'border-gray-200 dark:border-gray-600': 'BORDER_COLOR.medium',
    'border-gray-100 dark:border-gray-800': 'BORDER_COLOR.light',
    'border-gray-100 dark:border-gray-700': 'BORDER_COLOR.lightMedium',
    'border-gray-300 dark:border-gray-600': 'BORDER_COLOR.dark',
    'border-gray-200 dark:border-white/10': 'BORDER_COLOR.whiteAlpha',
    'border-green-200 dark:border-green-800': 'BORDER_COLOR.success',
    'border-yellow-200 dark:border-yellow-800': 'BORDER_COLOR.warning',
    'border-red-200 dark:border-red-800': 'BORDER_COLOR.error',
    'border-blue-200 dark:border-blue-800': 'BORDER_COLOR.info',

    # DIVIDE_COLOR
    'divide-gray-100 dark:divide-gray-700/50': 'DIVIDE_COLOR.lightSoft',
    'divide-gray-100 dark:divide-gray-700': 'DIVIDE_COLOR.light',
    'divide-gray-200 dark:divide-gray-700': 'DIVIDE_COLOR.default',
    'divide-gray-100 dark:divide-gray-800': 'DIVIDE_COLOR.lighter',
}

# 길이 내림차순으로 정렬 (긴 패턴 먼저)
SORTED_REPLACEMENTS = sorted(REPLACEMENTS.items(), key=lambda x: -len(x[0]))

def get_const_group(const_name: str) -> str:
    return const_name.split('.')[0]

def extract_needed_consts(content: str) -> set:
    """파일에서 필요한 상수 그룹 추출"""
    needed = set()
    for _, const_name in SORTED_REPLACEMENTS:
        group = get_const_group(const_name)
        if f'${{{const_name}}}' in content or f' {const_name} ' in content:
            needed.add(group)
    return needed

def replace_in_template_literal(content: str) -> tuple[str, int]:
    """className={`...`} 형태 내부의 패턴 교체"""
    count = 0
    for pattern, const_name in SORTED_REPLACEMENTS:
        if pattern in content:
            content = content.replace(pattern, f'${{{const_name}}}')
            count += content.count(f'${{{const_name}}}')
    return content, count

def process_classname_string(classname_value: str) -> str:
    """className="..." 내부 처리: 패턴 교체 후 적절한 JSX로 변환"""
    modified = classname_value
    replacements_made = []

    for pattern, const_name in SORTED_REPLACEMENTS:
        if pattern in modified:
            placeholder = f'__CONST_{const_name.replace(".", "_")}__'
            modified = modified.replace(pattern, placeholder)
            replacements_made.append((placeholder, const_name))

    if not replacements_made:
        return None  # 변경 없음

    # 플레이스홀더를 실제 표현식으로 변환
    # template literal로 변환: `...${CONST}...`
    for placeholder, const_name in replacements_made:
        modified = modified.replace(placeholder, f'${{{const_name}}}')

    # 공백 정리
    modified = re.sub(r'\s+', ' ', modified).strip()

    # 순수 ${...} 하나만 있는지 확인
    if re.match(r'^\$\{[A-Z_]+\.[a-zA-Z]+\}$', modified):
        # className={CONST_NAME} 형태
        const_expr = modified[2:-1]  # ${...} → ...
        return f'{{{const_expr}}}'
    else:
        # className={`...`} 형태
        return f'{{`{modified}`}}'

def pair_and_replace_classes(class_string: str) -> tuple[str, list]:
    """
    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' 같이
    분리된 라이트/다크 클래스 페어를 찾아서 교체합니다.
    """
    classes = class_string.split()
    light_classes = [c for c in classes if not c.startswith('dark:') and not c.startswith('hover:') and not c.startswith('focus:')]
    dark_classes = {c[5:]: c for c in classes if c.startswith('dark:')}  # 'dark:' 제거한 키: 원본

    replacements_made = []
    result_classes = list(classes)

    for light_cls in light_classes:
        # 이 light_cls에 대응하는 dark 클래스가 있는지 확인
        # 예: bg-gray-100 → dark:bg-gray-700 (dark_classes['bg-gray-700'])
        # 클래스 카테고리 추출 (bg, text, border, divide 등)
        cat_match = re.match(r'^(bg-|text-|border-|divide-)(.+)$', light_cls)
        if not cat_match:
            continue
        cat = cat_match.group(1)
        # 해당 카테고리의 dark 클래스들 찾기
        matching_dark = [orig for dk, orig in dark_classes.items() if dk.startswith(cat)]
        for dark_orig in matching_dark:
            pair = f'{light_cls} {dark_orig}'
            if pair in REPLACEMENTS:
                const_name = REPLACEMENTS[pair]
                # 두 클래스를 제거하고 상수로 교체
                result_classes = [c for c in result_classes if c != light_cls and c != dark_orig]
                replacements_made.append((const_name, light_cls, dark_orig))
                del dark_classes[dark_orig[5:]]  # 처리됨 표시
                break

    if not replacements_made:
        return class_string, []

    # 결과 조합: 상수 표현식을 적절한 위치에 삽입
    # 첫 번째 교체된 light 클래스 위치에 삽입
    result_with_consts = []
    inserted = set()
    for orig_cls in classes:
        replaced = False
        for const_name, light_cls, dark_orig in replacements_made:
            if orig_cls == light_cls and const_name not in inserted:
                result_with_consts.append(f'${{{const_name}}}')
                inserted.add(const_name)
                replaced = True
                break
        if not replaced and orig_cls not in [d for _, _, d in replacements_made]:
            result_with_consts.append(orig_cls)

    return ' '.join(result_with_consts), [r[0] for r in replacements_made]


def process_file(filepath: str) -> tuple[int, set]:
    """파일 처리: dark: 클래스 교체"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    total_replacements = 0
    used_consts = set()

    # 1단계: 이미 template literal인 className={`...`} 내부 교체
    def replace_template_literal(m):
        nonlocal total_replacements
        inner = m.group(1)
        modified = inner

        # 먼저 연속된 패턴 교체
        for pattern, const_name in SORTED_REPLACEMENTS:
            if pattern in modified:
                modified = modified.replace(pattern, f'${{{const_name}}}')
                used_consts.add(get_const_group(const_name))
                total_replacements += 1

        # 분리된 패턴 교체 (페어 매칭)
        # 각 분리된 문자열 세그먼트에서 페어 찾기
        segments = re.split(r'(\$\{[^}]+\})', modified)
        new_segments = []
        for seg in segments:
            if seg.startswith('${'):
                new_segments.append(seg)
            elif 'dark:' in seg:
                new_seg, consts = pair_and_replace_classes(seg)
                if consts:
                    total_replacements += len(consts)
                    for c in consts:
                        used_consts.add(get_const_group(c))
                new_segments.append(new_seg)
            else:
                new_segments.append(seg)
        modified = ''.join(new_segments)

        if modified != inner:
            return f'`{modified}`'
        return m.group(0)

    content = re.sub(r'`([^`]*dark:[^`]*)`', replace_template_literal, content)

    # 2단계: className="..." 형태 처리
    def replace_string_classname(m):
        nonlocal total_replacements
        value = m.group(2)

        modified = value
        local_replacements = []
        for pattern, const_name in SORTED_REPLACEMENTS:
            if pattern in modified:
                placeholder = f'__CONST_{const_name.replace(".", "_")}__'
                modified = modified.replace(pattern, placeholder)
                local_replacements.append((placeholder, const_name))
                total_replacements += 1
                used_consts.add(get_const_group(const_name))

        if not local_replacements:
            return m.group(0)

        for placeholder, const_name in local_replacements:
            modified = modified.replace(placeholder, f'${{{const_name}}}')

        modified = re.sub(r'\s+', ' ', modified).strip()

        if re.match(r'^\$\{[A-Z_]+\.[a-zA-Z]+\}$', modified):
            const_expr = modified[2:-1]
            return f'={{{const_expr}}}'
        else:
            return f'={{`{modified}`}}'

    # className="..." (double or single quote)
    content = re.sub(r'=("([^"]*dark:[^"]*)")', replace_string_classname, content)
    content = re.sub(r"=('([^']*dark:[^']*)')", replace_string_classname, content)

    # 3단계: JS 객체 값 내의 패턴 교체 (color: '...', className: '...' 등)
    def process_js_string_value(value: str) -> tuple[str, list]:
        """JS 문자열 값 처리: 연속 패턴 → 페어 패턴 순서로 교체"""
        modified = value
        found_consts = []

        # 연속 패턴 교체
        for pattern, const_name in SORTED_REPLACEMENTS:
            if pattern in modified:
                placeholder = f'__CONST_{const_name.replace(".", "_")}__'
                modified = modified.replace(pattern, placeholder)
                found_consts.append((placeholder, const_name))

        # 플레이스홀더 변환
        for placeholder, const_name in found_consts:
            modified = modified.replace(placeholder, f'${{{const_name}}}')

        # 분리된 패턴 교체 (페어 매칭)
        if 'dark:' in modified:
            new_seg, pair_consts = pair_and_replace_classes(modified)
            if pair_consts:
                modified = new_seg
                found_consts.extend([(None, c) for c in pair_consts])

        return modified, [c for _, c in found_consts]

    def replace_js_value(m):
        nonlocal total_replacements
        prefix = m.group(1)  # 'color: ' 등

        modified, found = process_js_string_value(m.group(2))

        if not found:
            return m.group(0)

        for c in found:
            total_replacements += 1
            used_consts.add(get_const_group(c))

        modified = re.sub(r'\s+', ' ', modified).strip()
        # 값 전체가 단일 상수인 경우
        if re.match(r'^\$\{[A-Z_]+\.[a-zA-Z]+\}$', modified):
            const_expr = modified[2:-1]
            return f'{prefix}{const_expr},'
        else:
            return f'{prefix}`{modified}`,'

    # color: '...' 패턴 (단일 따옴표)
    content = re.sub(r"((?:color|className|cls|class)\s*:\s*)'([^']*dark:[^']*)'(,?)", replace_js_value, content)

    # 조건부 삼항 연산자 내의 패턴도 처리 (? '...' : '...')
    def replace_ternary_string(m):
        nonlocal total_replacements
        prefix = m.group(1)  # '? ' or ': '
        modified, found = process_js_string_value(m.group(2))

        if not found:
            return m.group(0)

        for c in found:
            total_replacements += 1
            used_consts.add(get_const_group(c))

        modified = re.sub(r'\s+', ' ', modified).strip()
        if re.match(r'^\$\{[A-Z_]+\.[a-zA-Z]+\}$', modified):
            const_expr = modified[2:-1]
            return f'{prefix}{const_expr}'
        else:
            return f'{prefix}`{modified}`'

    content = re.sub(r"([?:]\s+)'([^']*dark:[^']*)'", replace_ternary_string, content)

    # return '...' 패턴 (단일 따옴표)
    def replace_return_value(m):
        nonlocal total_replacements
        modified = m.group(2)
        local_replacements = []
        for pattern, const_name in SORTED_REPLACEMENTS:
            if pattern in modified:
                placeholder = f'__CONST_{const_name.replace(".", "_")}__'
                modified = modified.replace(pattern, placeholder)
                local_replacements.append((placeholder, const_name))
                total_replacements += 1
                used_consts.add(get_const_group(const_name))

        if not local_replacements:
            return m.group(0)

        for placeholder, const_name in local_replacements:
            modified = modified.replace(placeholder, f'${{{const_name}}}')

        modified = re.sub(r'\s+', ' ', modified).strip()
        if re.match(r'^\$\{[A-Z_]+\.[a-zA-Z]+\}$', modified):
            const_expr = modified[2:-1]
            return f'{m.group(1)}{const_expr}'
        else:
            return f'{m.group(1)}`{modified}`'

    content = re.sub(r"(return\s+)'([^']*dark:[^']*)'", replace_return_value, content)

    if content == original:
        return 0, set()

    # 4단계: import 확인 및 추가
    if used_consts:
        # 기존 @/lib/styles import 찾기
        styles_import_pattern = r"import\s*\{([^}]+)\}\s*from\s*['\"]@/lib/styles['\"]"
        existing_match = re.search(styles_import_pattern, content)

        if existing_match:
            existing_imports = existing_match.group(1)
            existing_set = {s.strip() for s in existing_imports.split(',')}
            new_set = existing_set | used_consts
            if new_set != existing_set:
                new_imports = ', '.join(sorted(new_set))
                content = content.replace(
                    existing_match.group(0),
                    f"import {{ {new_imports} }} from '@/lib/styles'"
                )
        else:
            # 새 import 추가 (첫 번째 import 이후)
            new_const_import = f"import {{ {', '.join(sorted(used_consts))} }} from '@/lib/styles';"
            # 'use client' 또는 첫 번째 import 다음에 추가
            first_import = re.search(r'^(import .+|[\'"]use client[\'"];?\s*)', content, re.MULTILINE)
            if first_import:
                insert_pos = content.rfind('\n', 0, content.find('\n' + 'import ')) + 1
                # 마지막 import 이후에 추가
                last_import = None
                for m in re.finditer(r'^import .+$', content, re.MULTILINE):
                    last_import = m
                if last_import:
                    end_pos = last_import.end()
                    content = content[:end_pos] + '\n' + new_const_import + content[end_pos:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    return total_replacements, used_consts


def main():
    src_dir = Path(__file__).parent.parent / 'src'
    tsx_files = list(src_dir.glob('**/*.tsx'))

    total_files = 0
    total_replacements = 0

    for filepath in sorted(tsx_files):
        count, consts = process_file(str(filepath))
        if count > 0:
            total_files += 1
            total_replacements += count
            rel_path = filepath.relative_to(src_dir.parent)
            print(f"[{count:3d}건] {rel_path}  ({', '.join(sorted(consts))})")

    print(f"\n총 {total_files}개 파일, {total_replacements}건 교체 완료")


if __name__ == '__main__':
    main()
