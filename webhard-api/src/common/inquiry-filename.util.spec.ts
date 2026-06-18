/**
 * inquiry-filename.util 단위 테스트
 *
 * 스펙: tasks/18-drawing-consistency/phase1.md
 *       docs/specs/features/drawing-workflow.md §W (phase 0)
 *
 * 검증 범위:
 *   - pickInquiryNumberForDownload: revision → contact.processStage → inquiryType 우선순위
 *   - buildInquiryFileName: "[번호] 원본명" 포맷, 번호 없을 때 원본명 유지
 *   - buildInquiryFolderName: 문의 폴더용 O/F 번호 단독·공존·부재·분할 suffix
 */

import {
  buildInquiryFileName,
  buildInquiryFolderName,
  getInquiryTemplateName,
  pickInquiryNumberForDownload,
  slugifyPackageLabel,
} from './inquiry-filename.util';

const O = '260417-O-002';
const F = '260420-F-004';

describe('pickInquiryNumberForDownload', () => {
  it("revision.processStage='drawing_confirmed' with both numbers → workNumber", () => {
    expect(
      pickInquiryNumberForDownload(
        { inquiryNumber: O, workNumber: F },
        { processStage: 'drawing_confirmed' }
      )
    ).toBe(F);
  });

  it("revision.processStage='drawing' with both numbers → workNumber", () => {
    expect(
      pickInquiryNumberForDownload({ inquiryNumber: O, workNumber: F }, { processStage: 'drawing' })
    ).toBe(F);
  });

  it("revision 없음 + contact.processStage='laser' → workNumber", () => {
    expect(
      pickInquiryNumberForDownload({
        inquiryNumber: O,
        workNumber: F,
        processStage: 'laser',
      })
    ).toBe(F);
  });

  it("contact.processStage 미지정 + inquiryType='cutting_request' + workNumber 존재 → workNumber", () => {
    expect(
      pickInquiryNumberForDownload({
        inquiryNumber: O,
        workNumber: F,
        inquiryType: 'cutting_request',
      })
    ).toBe(F);
  });

  it("inquiryType='mold_request' → workNumber", () => {
    expect(
      pickInquiryNumberForDownload({
        inquiryNumber: O,
        workNumber: F,
        inquiryType: 'mold_request',
      })
    ).toBe(F);
  });

  it("inquiryType='laser_cutting' → workNumber", () => {
    expect(
      pickInquiryNumberForDownload({
        inquiryNumber: O,
        workNumber: F,
        inquiryType: 'laser_cutting',
      })
    ).toBe(F);
  });

  it('모든 stage·type 부재, workNumber 만 존재 → workNumber', () => {
    expect(
      pickInquiryNumberForDownload({
        inquiryNumber: null,
        workNumber: F,
      })
    ).toBe(F);
  });

  it('모든 stage·type 부재, inquiryNumber 만 존재 → inquiryNumber', () => {
    expect(
      pickInquiryNumberForDownload({
        inquiryNumber: O,
        workNumber: null,
      })
    ).toBe(O);
  });

  it('모든 필드 부재 → null', () => {
    expect(pickInquiryNumberForDownload({})).toBeNull();
  });

  it('revision.processStage=null 이어도 workNumber 존재 시 workNumber 우선', () => {
    expect(
      pickInquiryNumberForDownload({ inquiryNumber: O, workNumber: F }, { processStage: null })
    ).toBe(F);
  });
});

describe('buildInquiryFileName', () => {
  it('번호 있음 → "[번호] 원본명" 포맷', () => {
    expect(
      buildInquiryFileName({
        contact: { inquiryNumber: O, workNumber: F, processStage: 'laser' },
        originalName: 'sample.DXF',
      })
    ).toBe(`[${F}] sample.DXF`);
  });

  it('번호 없음 → 원본명 그대로', () => {
    expect(
      buildInquiryFileName({
        contact: {},
        originalName: 'nameless.dxf',
      })
    ).toBe('nameless.dxf');
  });

  it('한글 파일명 유지', () => {
    expect(
      buildInquiryFileName({
        contact: { inquiryNumber: O, inquiryType: 'cutting_request' },
        originalName: '목형도면 최종.DXF',
      })
    ).toBe(`[${O}] 목형도면 최종.DXF`);
  });

  it('기존 O prefix가 있는 파일도 workNumber가 있으면 F prefix 하나만 남긴다', () => {
    expect(
      buildInquiryFileName({
        contact: { inquiryNumber: O, workNumber: F, processStage: 'drawing' },
        originalName: `[${O}] 목형도면 최종.DXF`,
      })
    ).toBe(`[${F}] 목형도면 최종.DXF`);
  });
});

describe('buildInquiryFolderName', () => {
  it('O 만 → "{O}" (workNumber null 명시)', () => {
    expect(buildInquiryFolderName({ inquiryNumber: 'O-123', workNumber: null })).toBe('O-123');
  });

  it('O 만 → "{O}"', () => {
    expect(buildInquiryFolderName({ inquiryNumber: O })).toBe(O);
  });

  it('O + F → "{O}_{F}"', () => {
    expect(buildInquiryFolderName({ inquiryNumber: 'O-123', workNumber: 'F-456' })).toBe(
      'O-123_F-456'
    );
  });

  it('둘 다 → "{O}_{F}"', () => {
    expect(buildInquiryFolderName({ inquiryNumber: O, workNumber: F })).toBe(`${O}_${F}`);
  });

  it('P1-3 (task 21): 둘 다 null → null', () => {
    expect(buildInquiryFolderName({ inquiryNumber: null, workNumber: null })).toBeNull();
  });

  it('빈 객체 → null (기존 회귀)', () => {
    expect(buildInquiryFolderName({})).toBeNull();
  });

  it('F 만 → "{F}"', () => {
    expect(buildInquiryFolderName({ inquiryNumber: null, workNumber: 'F-456' })).toBe('F-456');
    expect(buildInquiryFolderName({ workNumber: F })).toBe(F);
  });

  it('분할 문의 suffix 보존 (O-1)', () => {
    expect(buildInquiryFolderName({ inquiryNumber: '260417-O-002-1' })).toBe('260417-O-002-1');
  });

  it('분할 문의 suffix 보존 (O-2 + F)', () => {
    expect(buildInquiryFolderName({ inquiryNumber: '260417-O-002-2', workNumber: F })).toBe(
      `260417-O-002-2_${F}`
    );
  });

  it('packageLabel 이 있어도 폴더명은 번호만 사용', () => {
    expect(
      buildInquiryFolderName({ packageLabel: '샘플A', inquiryNumber: 'O123', workNumber: null })
    ).toBe('O123');
  });

  it('filenameFallback 이 있어도 폴더명은 번호만 사용', () => {
    expect(
      buildInquiryFolderName({
        packageLabel: null,
        filenameFallback: '도면.dxf',
        inquiryNumber: 'O123',
        workNumber: null,
      })
    ).toBe('O123');
  });

  it('packageLabel 에 파일시스템 금지 문자가 있어도 번호만 사용', () => {
    expect(
      buildInquiryFolderName({
        packageLabel: 'a/b:c*',
        inquiryNumber: 'O123',
        workNumber: null,
      })
    ).toBe('O123');
  });

  it('packageLabel · filenameFallback 둘 다 없음 → "{O}"', () => {
    expect(
      buildInquiryFolderName({
        packageLabel: null,
        filenameFallback: null,
        inquiryNumber: 'O123',
        workNumber: null,
      })
    ).toBe('O123');
  });

  it('inquiryNumber=null + workNumber=null → null', () => {
    expect(
      buildInquiryFolderName({
        packageLabel: '샘플',
        filenameFallback: '도면.dxf',
        inquiryNumber: null,
        workNumber: null,
      })
    ).toBeNull();
  });

  it('packageLabel + workNumber 동시 → "{O}_{F}"', () => {
    expect(
      buildInquiryFolderName({
        packageLabel: '패키지',
        inquiryNumber: O,
        workNumber: F,
      })
    ).toBe(`${O}_${F}`);
  });

  it('packageLabel 이 빈/공백 문자열이어도 번호만 사용', () => {
    expect(
      buildInquiryFolderName({
        packageLabel: '   ',
        filenameFallback: '도면.dxf',
        inquiryNumber: 'O123',
        workNumber: null,
      })
    ).toBe('O123');
  });

  it('50자 초과 packageLabel 도 폴더명에 반영하지 않는다', () => {
    const long = 'A'.repeat(80);
    const result = buildInquiryFolderName({
      packageLabel: long,
      inquiryNumber: 'O123',
      workNumber: null,
    });
    expect(result).toBe('O123');
  });
});

describe('slugifyPackageLabel', () => {
  it('null/undefined/빈 문자열 → null', () => {
    expect(slugifyPackageLabel(null)).toBeNull();
    expect(slugifyPackageLabel(undefined)).toBeNull();
    expect(slugifyPackageLabel('')).toBeNull();
    expect(slugifyPackageLabel('   ')).toBeNull();
  });

  it('파일시스템 금지 문자 제거', () => {
    expect(slugifyPackageLabel('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });

  it('공백 → 단일 _', () => {
    expect(slugifyPackageLabel('hello world')).toBe('hello_world');
    expect(slugifyPackageLabel('hello   world  test')).toBe('hello_world_test');
  });

  it('한글/숫자 정상 보존', () => {
    expect(slugifyPackageLabel('샘플 패키지 001')).toBe('샘플_패키지_001');
  });

  it('50자 초과 → truncate', () => {
    expect(slugifyPackageLabel('A'.repeat(60))).toBe('A'.repeat(50));
  });

  it('NFKC 정규화 (전각 → 반각)', () => {
    expect(slugifyPackageLabel('ＡＢＣ')).toBe('ABC');
  });
});

describe('getInquiryTemplateName', () => {
  it('cutting_request → 칼선의뢰', () => {
    expect(getInquiryTemplateName('cutting_request')).toBe('칼선의뢰');
  });

  it('mold_request → 목형의뢰', () => {
    expect(getInquiryTemplateName('mold_request')).toBe('목형의뢰');
  });

  it('laser_cutting → 목형의뢰', () => {
    expect(getInquiryTemplateName('laser_cutting')).toBe('목형의뢰');
  });

  it('미분류(null/undefined/기타) → null', () => {
    expect(getInquiryTemplateName(null)).toBeNull();
    expect(getInquiryTemplateName(undefined)).toBeNull();
    expect(getInquiryTemplateName('quotation')).toBeNull();
  });
});
