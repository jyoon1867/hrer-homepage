"""
도메인 전환 스크립트 — vercel.app → hrer.kr 일괄 변경
사용: python scripts/switch_domain.py
실행 조건: Vercel에서 hrer.kr 녹색 체크 확인 후
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OLD = 'https://hrer-homepage.vercel.app'
NEW = 'https://hrer.kr'

TARGET_EXTS = {'.html', '.xml', '.txt', '.js', '.json', '.md'}
EXCLUDE_DIRS = {'.git', 'node_modules', 'output', 'docs'}

def should_skip(p: Path) -> bool:
    for part in p.parts:
        if part in EXCLUDE_DIRS: return True
    return False


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    changed_files = []
    total_replacements = 0

    for p in ROOT.rglob('*'):
        if not p.is_file(): continue
        if p.suffix not in TARGET_EXTS: continue
        if should_skip(p): continue

        try:
            s = p.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue

        if OLD not in s:
            continue

        count = s.count(OLD)
        new_s = s.replace(OLD, NEW)
        p.write_text(new_s, encoding='utf-8')
        changed_files.append((p.relative_to(ROOT), count))
        total_replacements += count

    print(f'=== 도메인 전환 결과 ===')
    print(f'교체: {OLD} → {NEW}')
    print(f'파일 수: {len(changed_files)}개')
    print(f'총 교체: {total_replacements}건')
    print()
    for path, cnt in changed_files:
        print(f'  {path}: {cnt}건')
    print()
    print('다음 단계: git add -A && git commit && git push')


if __name__ == '__main__':
    main()
