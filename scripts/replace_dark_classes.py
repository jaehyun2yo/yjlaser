#!/usr/bin/env python3
"""
src/app/(admin)/ 하위 파일에서 dark: 직접 클래스를 @/lib/styles 상수로 교체
"""
import os
import re

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'app', '(admin)')

# (원본 패턴, 상수 참조)
REPLACEMENTS = [
    ('text-gray-900 dark:text-gray-100', 'TEXT_COLOR.primary'),
    ('text-gray-700 dark:text-gray-300', 'TEXT_COLOR.secondary'),
    ('text-gray-600 dark:text-gray-400', 'TEXT_COLOR.tertiary'),
    ('text-gray-500 dark:text-gray-500', 'TEXT_COLOR.muted'),
    ('bg-white dark:bg-gray-800', 'BG_COLOR.white'),
    ('bg-gray-50 dark:bg-gray-900', 'BG_COLOR.gray'),
    ('bg-gray-100 dark:bg-gray-700', 'BG_COLOR.light'),
    ('border-gray-200 dark:border-gray-700', 'BORDER_COLOR.default'),
    ('border-gray-300 dark:border-gray-600', 'BORDER_COLOR.dark'),
]


def replace_patterns(content: str) -> tuple[str, int]:
    """파일 내용에서 패턴을 교체하고 (새 내용, 교체 건수) 반환"""
    total_count = [0]  # list로 nonlocal 우회

    for old_pattern, const_ref in REPLACEMENTS:
        template_literal = '${' + const_ref + '}'

        # ── 1. backtick template literal 안에서 교체 ──────────────────────────
        def replace_in_backtick(m: re.Match, _op=old_pattern, _tl=template_literal) -> str:
            inner = m.group(1)
            if _op in inner:
                total_count[0] += inner.count(_op)
                return '`' + inner.replace(_op, _tl) + '`'
            return m.group(0)

        content = re.sub(r'`([^`]*)`', replace_in_backtick, content)

        # ── 2. string literal (따옴표) className 안에서 교체 ─────────────────
        # 2a. 단독 패턴: className="OLD" → className={ConstRef}
        single_re = r'className="' + re.escape(old_pattern) + r'"'
        new_content, n = re.subn(single_re, f'className={{{const_ref}}}', content)
        if n:
            total_count[0] += n
            content = new_content
            continue  # 2b 스킵 (이미 처리됨)

        # 2b. 혼합 패턴: className="...OLD..." → className={`...TL...`}
        def replace_in_string(m: re.Match, _op=old_pattern, _tl=template_literal) -> str:
            inner = m.group(1)
            if _op in inner:
                total_count[0] += inner.count(_op)
                return 'className={`' + inner.replace(_op, _tl) + '`}'
            return m.group(0)

        content = re.sub(r'className="([^"]*)"', replace_in_string, content)

    return content, total_count[0]


def update_imports(content: str) -> str:
    """필요한 상수를 import에 추가"""
    needed: list[str] = []
    if 'TEXT_COLOR.' in content:
        needed.append('TEXT_COLOR')
    if 'BG_COLOR.' in content:
        needed.append('BG_COLOR')
    if 'BORDER_COLOR.' in content:
        needed.append('BORDER_COLOR')

    if not needed:
        return content

    # 기존 @/lib/styles import 찾기
    existing_match = re.search(
        r"import\s*\{([^}]+)\}\s*from\s*['\"]@/lib/styles['\"]",
        content
    )

    if existing_match:
        existing_names = [x.strip() for x in existing_match.group(1).split(',') if x.strip()]
        merged = sorted(set(existing_names + needed))
        new_import = "import { " + ', '.join(merged) + " } from '@/lib/styles'"
        content = content[:existing_match.start()] + new_import + content[existing_match.end():]
    else:
        # 첫 번째 import 앞에 삽입
        new_import_line = "import { " + ', '.join(sorted(needed)) + " } from '@/lib/styles';\n"
        first_import = re.search(r'^import ', content, re.MULTILINE)
        if first_import:
            content = content[:first_import.start()] + new_import_line + content[first_import.start():]
        else:
            content = new_import_line + content

    return content


def process_file(filepath: str) -> int:
    """파일 처리 후 교체 건수 반환"""
    with open(filepath, encoding='utf-8') as f:
        original = f.read()

    new_content, count = replace_patterns(original)

    if count == 0:
        return 0

    new_content = update_imports(new_content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    return count


def main() -> None:
    total_files = 0
    total_count = 0
    changed: list[str] = []

    admin_base = os.path.abspath(BASE_DIR)

    for root, _, files in os.walk(admin_base):
        for fname in sorted(files):
            if fname.endswith(('.tsx', '.ts')):
                fpath = os.path.join(root, fname)
                cnt = process_file(fpath)
                if cnt > 0:
                    total_files += 1
                    total_count += cnt
                    rel = os.path.relpath(fpath, os.path.join(admin_base, '..', '..', '..'))
                    changed.append(f'  {rel}: {cnt}건')

    print(f'완료: {total_files}개 파일, 총 {total_count}건 교체\n')
    print('수정된 파일:')
    for line in changed:
        print(line)


if __name__ == '__main__':
    main()
