/**
 * 소개 페이지 데이터
 */

import type {
  HistoryItem,
  FacilityItem,
  CoreValue,
  SummaryBlock,
  ProcessStep,
  MainStoryData,
} from './types';

// 회사 연혁 데이터
export const HISTORY_DATA: HistoryItem[] = [
  {
    year: 2021,
    events: ['710-B 벤딩기 추가 설치로 생산 능력 확대'],
  },
  {
    year: 2019,
    events: ['최신형 레이저 커팅 시스템 도입', '고정밀 샘플 제작기 교체'],
  },
  {
    year: 2012,
    events: ['애드(ADD) 정밀 가공 설비 도입'],
  },
  {
    year: 2007,
    events: ['목형 전용 레이저 커팅기 도입으로 생산 자동화 실현'],
  },
  {
    year: 2005,
    events: ['목형 제조용 벤딩기(710-B) 도입', '본격적인 설비 현대화 착수'],
  },
  {
    year: 2004,
    events: ['유진레이저목형 설립 (1월)', '충무로 인쇄 산업 단지 내 사업 개시'],
  },
];

// 생산 시설 데이터
export const FACILITY_DATA: FacilityItem[] = [
  {
    id: 'laser',
    title: '레이저 목형 제작 시스템',
    description:
      '정밀 레이저 커팅으로 복잡한 형상도 오차 없이 구현합니다. 0.1mm 단위의 정밀도로 어떤 구조도 정확하게 재현할 수 있습니다.',
  },
  {
    id: 'cad',
    title: 'CAD 기반 구조 설계',
    description:
      '3D 모델링을 통한 사전 검증 및 고객 시뮬레이션을 제공합니다. 실제 제작 전 구조적 문제를 미리 파악하고 해결합니다.',
  },
  {
    id: 'sample',
    title: '샘플 제작 설비',
    description:
      '신속한 프로토타입 제작으로 의사결정 시간을 단축합니다. 고객이 직접 확인하고 피드백할 수 있는 실물 샘플을 제공합니다.',
  },
  {
    id: 'quality',
    title: '품질 검수 시스템',
    description:
      '출고 전 전수 검사를 통한 불량률 최소화를 실현합니다. 엄격한 품질 기준으로 완벽한 제품만을 납품합니다.',
  },
];

// 핵심 가치 데이터
export const CORE_VALUES: CoreValue[] = [
  {
    id: 'precision',
    title: '정밀',
    titleEn: 'Precision',
    description: '0.1mm의 오차도 허용하지 않습니다. 수만 번의 생산에도 흔들림 없는 일관성을 보장합니다.',
  },
  {
    id: 'trust',
    title: '신뢰',
    titleEn: 'Trust',
    description: '전국 어디서나 동일한 품질 기준, 납기 약속 준수. 20년간 기본을 축적해왔습니다.',
  },
  {
    id: 'expertise',
    title: '전문성',
    titleEn: 'Expertise',
    description: '오직 지기구조 목형 제조에 집중. 깊이 있는 기술력으로 고객의 생산 경쟁력을 높입니다.',
  },
];

// 핵심 요약 블록 데이터
export const SUMMARY_BLOCKS: SummaryBlock[] = [
  {
    id: 'what',
    title: '목형이란?',
    content:
      '패키지의 눈에 보이지 않는 설계도입니다. 접힘선, 조립 구조, 생산 일관성 모두 정밀한 목형에서 시작됩니다.',
  },
  {
    id: 'why',
    title: '왜 유진레이저목형인가?',
    content:
      '2004년부터 오직 한 분야에 집중. 20년간 축적된 경험이 고객의 생산 효율을 높이는 실질적 기술력으로 전환되었습니다.',
  },
  {
    id: 'how',
    title: '어떻게 일하는가?',
    content:
      '설계 단계에서부터 완성을 고려합니다. 전 공정 품질 관리와 출고 전 검수로 현장 리스크를 사전 차단합니다.',
  },
];

// 메인 스토리 텍스트
export const MAIN_STORY: MainStoryData = {
  title: 'Precision Creates Trust',
  subtitle: '정밀함으로 신뢰를 만듭니다',
  sections: [
    {
      id: 'intro',
      title: '패키지의 시작점, 목형',
      content: `패키지가 세상에 나오기까지, 그 시작점에는 목형이 있습니다.

소비자가 손에 쥐는 박스의 깔끔한 접힘선, 정확하게 맞물리는 조립 구조, 수만 번의 생산에도 흔들림 없는 일관성. 이 모든 것은 0.1mm의 오차도 허용하지 않는 정밀한 목형에서 시작됩니다. 목형은 패키지의 눈에 보이지 않는 설계도이자, 대량 생산의 품질을 결정짓는 핵심 요소입니다.`,
    },
    {
      id: 'history',
      title: '20년, 한 우물을 파다',
      content: `유진레이저목형은 2004년부터 오직 지기구조 목형 제조라는 한 분야에 집중해왔습니다. 화려한 확장보다 깊이 있는 전문성을 선택했습니다.

20년이라는 시간 동안 종이가 접히는 원리, 칼날이 만들어내는 결과, 생산 현장에서 발생하는 수많은 변수들을 연구하고 축적해왔습니다. 이 경험은 단순한 연차가 아닌, 고객의 생산 효율을 높이는 실질적인 기술력으로 전환되었습니다.`,
    },
    {
      id: 'design',
      title: 'We Design Structure',
      titleSub: '구조를 설계합니다',
      content: `박스는 단순한 종이 상자가 아닙니다. 내용물의 무게를 지탱하고, 조립 공정의 효율을 결정하며, 브랜드의 첫인상을 만들어내는 정교한 구조물입니다.

당사는 고객사의 요구사항을 단순히 수용하는 것이 아니라, 생산 환경과 제품 특성을 종합적으로 분석하여 가장 효율적인 지기구조를 제안합니다. 도면 위의 선 하나가 생산 현장에서 어떤 결과로 이어지는지 알기에, 설계 단계에서부터 완성을 고려합니다.`,
    },
    {
      id: 'trust',
      title: 'We Build Trust',
      titleSub: '신뢰를 제조합니다',
      content: `레이저 커팅과 톰슨 다이 작업에 최적화된 목형을 제작합니다. 전 공정에 걸친 품질 관리 시스템을 운영하며, 출고 전 검수를 통해 현장에서 발생할 수 있는 리스크를 사전에 차단합니다.

전국 어디서나 동일한 품질 기준을 적용하며, 납기 약속을 준수합니다. 당사와 오랜 기간 거래를 이어온 고객사들이 많은 이유는 특별한 마케팅이 아닌, 이러한 기본의 축적입니다.`,
    },
    {
      id: 'partner',
      title: '패키징 산업의 보이지 않는 파트너',
      content: `고객의 제품이 소비자에게 전달되는 그 순간, 우리의 목형은 이름을 남기지 않습니다.

하지만 박스가 정확하게 접히고, 생산 라인이 멈춤 없이 돌아가고, 완성된 패키지가 브랜드의 가치를 온전히 전달할 때, 그 뒤에는 유진레이저목형의 기술이 있습니다. 우리는 무대 위가 아닌 무대 뒤에서, 고객의 성공을 지원하는 역할에 충실합니다.`,
    },
  ],
  closing: {
    quote: '정밀함으로 신뢰를 만든다.',
    description:
      '이것이 유진레이저목형이 20년간 지켜온 원칙이며, 앞으로도 변하지 않을 약속입니다. 패키징 산업이 요구하는 기술적 기준을 충족하는 것을 넘어, 고객사의 생산 경쟁력을 높이는 실질적인 파트너가 되겠습니다.',
  },
};

// 제작과정 데이터
// 이미지 경로: /images/process/ 폴더에 저장
export const PROCESS_STEPS: ProcessStep[] = [
  {
    id: 'inquiry',
    step: 1,
    title: '상담 및 의뢰',
    description: '고객의 요구사항을 정확히 파악하고 최적의 솔루션을 제안합니다.',
    details: [
      '제품 사양 및 용도 확인',
      '수량, 납기, 예산 협의',
      '기존 샘플 또는 도면 검토',
      '최적 구조 및 소재 제안',
    ],
    image: '/images/process/inquiry.jpg',
  },
  {
    id: 'design',
    step: 2,
    title: '구조 설계',
    description: 'CAD를 활용한 정밀 설계로 제품에 최적화된 구조를 설계합니다.',
    details: [
      '3D CAD 설계 진행',
      '구조 강도 및 조립성 검토',
      '제품 보호 및 진열 효과 고려',
      '고객 피드백 반영 및 수정',
    ],
    image: '/images/process/design.jpg',
  },
  {
    id: 'sample',
    step: 3,
    title: '샘플 제작',
    description: '실제 제품을 담아 테스트할 수 있는 샘플을 제작합니다.',
    details: [
      '플로터를 통한 샘플 커팅',
      '수작업 접기 및 조립',
      '실제 제품 피팅 테스트',
      '고객 확인 및 승인',
    ],
    image: '/images/process/sample.jpg',
  },
  {
    id: 'mold',
    step: 4,
    title: '목형 제작',
    description: '레이저 정밀 가공으로 양산용 목형을 제작합니다.',
    details: [
      '레이저 커팅 데이터 변환',
      '합판 베이스 가공',
      '칼날 삽입 및 정밀 조정',
      '누름 및 스폰지 부착',
    ],
    image: '/images/process/mold.jpg',
  },
  {
    id: 'quality',
    step: 5,
    title: '품질 검수',
    description: '엄격한 품질 기준에 따라 완성된 목형을 검사합니다.',
    details: ['치수 정밀도 측정', '칼날 높이 및 압력 확인', '테스트 타발 진행', '최종 품질 승인'],
    image: '/images/process/quality.jpg',
  },
  {
    id: 'delivery',
    step: 6,
    title: '납품 및 A/S',
    description: '안전하게 포장하여 납품하고, 지속적인 품질 관리를 제공합니다.',
    details: [
      '안전 포장 및 배송',
      '인쇄소 타발기 세팅 지원',
      '양산 초기 품질 확인',
      '사후 관리 및 수정 대응',
    ],
    image: '/images/process/delivery.jpg',
  },
];

// 회사 기본 정보
export const COMPANY_INFO = {
  name: '(주)유진레이저목형',
  nameEn: 'YJ Laser Co., Ltd.',
  founded: '2004년',
  address: '서울 중구 퇴계로39길 20, 2층',
  phone: '02-2264-8070',
  fax: '02-2264-8310',
  email: 'aone8070@korea.com',
  business: '패키징 설계, 샘플 제작, 목형 제작',
  slogan: '정밀함으로 신뢰를 만든다',
};
