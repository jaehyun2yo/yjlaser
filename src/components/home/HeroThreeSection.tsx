'use client';

import { useRef, useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, Grid } from '@react-three/drei';
import { motion } from 'framer-motion';
import Link from 'next/link';
import * as THREE from 'three';

// 마우스 위치를 공유하기 위한 Context
const MouseContext = createContext({ x: 0, y: 0 });

// 박스 타입 정의
type BoxType = 'B' | 'A' | 'G' | 'Y' | 'S' | 'POJIBARI';

const BOX_TYPES: BoxType[] = ['B', 'A', 'G', 'Y', 'S', 'POJIBARI'];

// 부드러운 보간을 위한 lerp 함수
function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

// 마우스 따라가는 카메라
function MouseCamera() {
  const { camera } = useThree();
  const mouse = useContext(MouseContext);
  const targetPosition = useRef(new THREE.Vector3(6, 4, 6));

  useFrame(() => {
    const targetX = 6 + mouse.x * 2;
    const targetY = 4 + mouse.y * 1;
    const targetZ = 6 + mouse.x * 0.5;

    targetPosition.current.set(targetX, targetY, targetZ);
    camera.position.lerp(targetPosition.current, 0.05);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// B형 박스 (맞뚜껑 박스 - 위아래 플랩이 맞닿는 형태)
// 실제 B형 박스: 상단과 하단에 각각 4개의 플랩이 있고, 서로 접어 닫히는 구조
function BTypeBox({ lidAngle }: { lidAngle: number }) {
  const w = 2.2,
    h = 1.6,
    d = 1.8;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;

  // 플랩 크기 (실제 비율 - 긴 플랩이 서로 만남)
  const outerFlapH = hd * 0.95; // 앞뒤 긴 플랩 (서로 만남)
  const innerFlapH = hd * 0.55; // 좌우 짧은 플랩
  const flapThickness = 0.02;

  // 박스 본체
  const bodyVerts: [number, number, number][] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, hh, -hd],
    [-hw, hh, -hd],
    [-hw, -hh, hd],
    [hw, -hh, hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  const bodyEdges: [[number, number, number], [number, number, number]][] = [
    [bodyVerts[0], bodyVerts[1]],
    [bodyVerts[1], bodyVerts[2]],
    [bodyVerts[2], bodyVerts[3]],
    [bodyVerts[3], bodyVerts[0]],
    [bodyVerts[4], bodyVerts[5]],
    [bodyVerts[5], bodyVerts[6]],
    [bodyVerts[6], bodyVerts[7]],
    [bodyVerts[7], bodyVerts[4]],
    [bodyVerts[0], bodyVerts[4]],
    [bodyVerts[1], bodyVerts[5]],
    [bodyVerts[2], bodyVerts[6]],
    [bodyVerts[3], bodyVerts[7]],
  ];

  // 접힘 각도 계산
  const lidRad = (lidAngle * Math.PI) / 180;
  const cosL = Math.cos(lidRad);
  const sinL = Math.sin(lidRad);

  // 상단 플랩 (4개)
  // 1. 앞면 긴 플랩 (안쪽으로 접힘)
  const topFrontFlap: [number, number, number][] = [
    [-hw + 0.02, hh, -hd],
    [hw - 0.02, hh, -hd],
    [hw - 0.02, hh + flapThickness, -hd + outerFlapH * sinL],
    [-hw + 0.02, hh + flapThickness, -hd + outerFlapH * sinL],
  ];
  // 중간 접힘선
  const topFrontFlapTop: [number, number, number][] = [
    [-hw + 0.02, hh + outerFlapH * cosL, -hd + outerFlapH * sinL],
    [hw - 0.02, hh + outerFlapH * cosL, -hd + outerFlapH * sinL],
  ];

  // 2. 뒷면 긴 플랩
  const topBackFlap: [number, number, number][] = [
    [-hw + 0.02, hh, hd],
    [hw - 0.02, hh, hd],
    [hw - 0.02, hh + flapThickness, hd - outerFlapH * sinL],
    [-hw + 0.02, hh + flapThickness, hd - outerFlapH * sinL],
  ];
  const topBackFlapTop: [number, number, number][] = [
    [-hw + 0.02, hh + outerFlapH * cosL, hd - outerFlapH * sinL],
    [hw - 0.02, hh + outerFlapH * cosL, hd - outerFlapH * sinL],
  ];

  // 3. 좌측 짧은 플랩 (먼저 접힘)
  const innerAngle = Math.min(lidAngle * 1.2, 90);
  const innerRad = (innerAngle * Math.PI) / 180;
  const cosI = Math.cos(innerRad);
  const sinI = Math.sin(innerRad);

  const topLeftFlap: [number, number, number][] = [
    [-hw, hh, -hd + 0.02],
    [-hw, hh, hd - 0.02],
    [-hw + innerFlapH * sinI, hh + innerFlapH * cosI, hd - 0.02],
    [-hw + innerFlapH * sinI, hh + innerFlapH * cosI, -hd + 0.02],
  ];

  // 4. 우측 짧은 플랩
  const topRightFlap: [number, number, number][] = [
    [hw, hh, -hd + 0.02],
    [hw, hh, hd - 0.02],
    [hw - innerFlapH * sinI, hh + innerFlapH * cosI, hd - 0.02],
    [hw - innerFlapH * sinI, hh + innerFlapH * cosI, -hd + 0.02],
  ];

  // 접힘선 (폴드라인)
  const foldLines: [[number, number, number], [number, number, number]][] = [
    [
      [-hw + 0.02, hh, -hd],
      [hw - 0.02, hh, -hd],
    ], // 앞면 상단
    [
      [-hw + 0.02, hh, hd],
      [hw - 0.02, hh, hd],
    ], // 뒷면 상단
    [
      [-hw, hh, -hd + 0.02],
      [-hw, hh, hd - 0.02],
    ], // 좌측
    [
      [hw, hh, -hd + 0.02],
      [hw, hh, hd - 0.02],
    ], // 우측
  ];

  const flapEdges = (
    flap: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [flap[0], flap[1]],
    [flap[1], flap[2]],
    [flap[2], flap[3]],
    [flap[3], flap[0]],
  ];

  return (
    <group>
      {/* 본체 */}
      {bodyEdges.map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}

      {/* 접힘선 (점선 효과) */}
      {foldLines.map((e, i) => (
        <Line
          key={`fold-${i}`}
          points={e}
          color="#ED6C00"
          lineWidth={1}
          dashed
          dashSize={0.1}
          gapSize={0.05}
        />
      ))}

      {/* 상단 플랩들 */}
      {flapEdges(topFrontFlap).map((e, i) => (
        <Line key={`tf-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
      <Line points={topFrontFlapTop} color="#ED6C00" lineWidth={2} />

      {flapEdges(topBackFlap).map((e, i) => (
        <Line key={`tb-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
      <Line points={topBackFlapTop} color="#ED6C00" lineWidth={2} />

      {flapEdges(topLeftFlap).map((e, i) => (
        <Line key={`tl-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}
      {flapEdges(topRightFlap).map((e, i) => (
        <Line key={`tr-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}

      {/* 반투명 면 */}
      <mesh>
        <boxGeometry args={[w * 0.98, h * 0.98, d * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.06} transparent />
      </mesh>
    </group>
  );
}

// A형 박스 (싸바리 박스 - 뚜껑이 본체를 감싸는 형태)
// 실제 A형 박스: 속박스와 겉박스(뚜껑)가 분리되어 뚜껑이 속박스를 덮는 고급 구조
function ATypeBox({ lidOffset }: { lidOffset: number }) {
  const w = 2,
    h = 1.4,
    d = 1.8;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;

  // 뚜껑 깊이 (본체를 감싸는 정도)
  const lidOverlap = 0.35;
  const lidH = 0.4;
  const wallGap = 0.08; // 뚜껑과 본체 사이 간격

  // 하단 본체 (속박스)
  const bottomVerts: [number, number, number][] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, hh, -hd],
    [-hw, hh, -hd],
    [-hw, -hh, hd],
    [hw, -hh, hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  // 본체 내부 바닥면 라인 (깊이감)
  const innerBottom: [[number, number, number], [number, number, number]][] = [
    [
      [-hw + 0.05, -hh + 0.05, -hd + 0.05],
      [hw - 0.05, -hh + 0.05, -hd + 0.05],
    ],
    [
      [hw - 0.05, -hh + 0.05, -hd + 0.05],
      [hw - 0.05, -hh + 0.05, hd - 0.05],
    ],
    [
      [hw - 0.05, -hh + 0.05, hd - 0.05],
      [-hw + 0.05, -hh + 0.05, hd - 0.05],
    ],
    [
      [-hw + 0.05, -hh + 0.05, hd - 0.05],
      [-hw + 0.05, -hh + 0.05, -hd + 0.05],
    ],
  ];

  // 상단 뚜껑 (겉박스) - 본체보다 약간 크고 아래로 감쌈
  const lidW = w + wallGap * 2,
    lidD = d + wallGap * 2;
  const lhw = lidW / 2,
    lhd = lidD / 2;
  const lidBaseY = hh - lidOverlap + lidOffset;

  // 뚜껑 본체
  const lidVerts: [number, number, number][] = [
    [-lhw, lidBaseY, -lhd],
    [lhw, lidBaseY, -lhd],
    [lhw, lidBaseY + lidH + lidOverlap, -lhd],
    [-lhw, lidBaseY + lidH + lidOverlap, -lhd],
    [-lhw, lidBaseY, lhd],
    [lhw, lidBaseY, lhd],
    [lhw, lidBaseY + lidH + lidOverlap, lhd],
    [-lhw, lidBaseY + lidH + lidOverlap, lhd],
  ];

  // 뚜껑 하단 테두리 (아래로 내려오는 부분)
  const lidBottomEdge: [[number, number, number], [number, number, number]][] = [
    [
      [-lhw, lidBaseY, -lhd],
      [lhw, lidBaseY, -lhd],
    ],
    [
      [lhw, lidBaseY, -lhd],
      [lhw, lidBaseY, lhd],
    ],
    [
      [lhw, lidBaseY, lhd],
      [-lhw, lidBaseY, lhd],
    ],
    [
      [-lhw, lidBaseY, lhd],
      [-lhw, lidBaseY, -lhd],
    ],
  ];

  // 뚜껑 상단 면 라인
  const lidTopFace: [[number, number, number], [number, number, number]][] = [
    [
      [-lhw + 0.03, lidBaseY + lidH + lidOverlap - 0.03, -lhd + 0.03],
      [lhw - 0.03, lidBaseY + lidH + lidOverlap - 0.03, -lhd + 0.03],
    ],
    [
      [lhw - 0.03, lidBaseY + lidH + lidOverlap - 0.03, -lhd + 0.03],
      [lhw - 0.03, lidBaseY + lidH + lidOverlap - 0.03, lhd - 0.03],
    ],
    [
      [lhw - 0.03, lidBaseY + lidH + lidOverlap - 0.03, lhd - 0.03],
      [-lhw + 0.03, lidBaseY + lidH + lidOverlap - 0.03, lhd - 0.03],
    ],
    [
      [-lhw + 0.03, lidBaseY + lidH + lidOverlap - 0.03, lhd - 0.03],
      [-lhw + 0.03, lidBaseY + lidH + lidOverlap - 0.03, -lhd + 0.03],
    ],
  ];

  const boxEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
    [v[4], v[5]],
    [v[5], v[6]],
    [v[6], v[7]],
    [v[7], v[4]],
    [v[0], v[4]],
    [v[1], v[5]],
    [v[2], v[6]],
    [v[3], v[7]],
  ];

  return (
    <group>
      {/* 본체 */}
      {boxEdges(bottomVerts).map((e, i) => (
        <Line key={`bottom-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}

      {/* 본체 내부 바닥 (깊이감) */}
      {innerBottom.map((e, i) => (
        <Line key={`inner-${i}`} points={e} color="#ED6C00" lineWidth={1} />
      ))}

      {/* 뚜껑 */}
      {boxEdges(lidVerts).map((e, i) => (
        <Line key={`lid-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}

      {/* 뚜껑 하단 테두리 강조 */}
      {lidBottomEdge.map((e, i) => (
        <Line key={`lid-bottom-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}

      {/* 뚜껑 상단 면 */}
      {lidTopFace.map((e, i) => (
        <Line key={`lid-top-${i}`} points={e} color="#ED6C00" lineWidth={1} />
      ))}

      {/* 반투명 면 */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w * 0.98, h * 0.98, d * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.06} transparent />
      </mesh>
      <mesh position={[0, lidBaseY + (lidH + lidOverlap) / 2, 0]}>
        <boxGeometry args={[lidW * 0.98, (lidH + lidOverlap) * 0.98, lidD * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.06} transparent />
      </mesh>
    </group>
  );
}

// G형 박스 (자석 플립박스 - 책처럼 열리는 고급 박스)
// 힌지가 뒷면 상단에 있어 앞으로 젖혀지는 구조
function GTypeBox({ lidAngle }: { lidAngle: number }) {
  const w = 2.2,
    h = 1.2,
    d = 1.8;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const wallT = 0.06;
  const lidH = 0.15; // 뚜껑 두께

  // 하단 박스 본체
  const bottomVerts: [number, number, number][] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, hh, -hd],
    [-hw, hh, -hd],
    [-hw, -hh, hd],
    [hw, -hh, hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  // 내부 바닥 (깊이감)
  const innerBottom: [[number, number, number], [number, number, number]][] = [
    [
      [-hw + wallT, -hh + wallT, -hd + wallT],
      [hw - wallT, -hh + wallT, -hd + wallT],
    ],
    [
      [hw - wallT, -hh + wallT, -hd + wallT],
      [hw - wallT, -hh + wallT, hd - wallT],
    ],
    [
      [hw - wallT, -hh + wallT, hd - wallT],
      [-hw + wallT, -hh + wallT, hd - wallT],
    ],
    [
      [-hw + wallT, -hh + wallT, hd - wallT],
      [-hw + wallT, -hh + wallT, -hd + wallT],
    ],
  ];

  // 뚜껑 - 힌지는 뒷면 상단 (z=hd, y=hh)
  // 뚜껑이 앞으로 젖혀지면서 열림
  const rad = (lidAngle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 뚜껑 크기 (본체를 완전히 덮는 크기)
  const lidW = w + 0.08;
  const lidD = d + 0.08;
  const lhw = lidW / 2;
  const lhd = lidD / 2;

  // 뚜껑 4개 꼭짓점 (힌지 기준 회전)
  // 힌지 축: y=hh, z=hd 에서 x축을 중심으로 회전
  // 닫힌 상태: 뚜껑이 본체 위에 평평하게
  // 열린 상태: 뚜껑이 뒤로 젖혀짐
  const lidVerts: [number, number, number][] = [
    // 뒷면 (힌지 쪽) - 회전 없음
    [-lhw, hh, hd],
    [lhw, hh, hd],
    // 앞면 - 회전됨
    [lhw, hh + lhd * 2 * sin, hd - lhd * 2 * cos],
    [-lhw, hh + lhd * 2 * sin, hd - lhd * 2 * cos],
  ];

  // 뚜껑 상단면 (두께 표현)
  const lidTopVerts: [number, number, number][] = [
    [-lhw, hh + lidH * cos, hd + lidH * sin],
    [lhw, hh + lidH * cos, hd + lidH * sin],
    [lhw, hh + lhd * 2 * sin + lidH * cos, hd - lhd * 2 * cos + lidH * sin],
    [-lhw, hh + lhd * 2 * sin + lidH * cos, hd - lhd * 2 * cos + lidH * sin],
  ];

  // 뚜껑 모서리 라인
  const lidEdges: [[number, number, number], [number, number, number]][] = [
    // 하단면
    [lidVerts[0], lidVerts[1]],
    [lidVerts[1], lidVerts[2]],
    [lidVerts[2], lidVerts[3]],
    [lidVerts[3], lidVerts[0]],
    // 상단면
    [lidTopVerts[0], lidTopVerts[1]],
    [lidTopVerts[1], lidTopVerts[2]],
    [lidTopVerts[2], lidTopVerts[3]],
    [lidTopVerts[3], lidTopVerts[0]],
    // 수직 연결
    [lidVerts[0], lidTopVerts[0]],
    [lidVerts[1], lidTopVerts[1]],
    [lidVerts[2], lidTopVerts[2]],
    [lidVerts[3], lidTopVerts[3]],
  ];

  const boxEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
    [v[4], v[5]],
    [v[5], v[6]],
    [v[6], v[7]],
    [v[7], v[4]],
    [v[0], v[4]],
    [v[1], v[5]],
    [v[2], v[6]],
    [v[3], v[7]],
  ];

  return (
    <group>
      {/* 본체 */}
      {boxEdges(bottomVerts).map((e, i) => (
        <Line key={`bottom-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}

      {/* 내부 바닥 */}
      {innerBottom.map((e, i) => (
        <Line key={`inner-${i}`} points={e} color="#ED6C00" lineWidth={1} />
      ))}

      {/* 뚜껑 */}
      {lidEdges.map((e, i) => (
        <Line key={`lid-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}

      {/* 반투명 면 */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w * 0.98, h * 0.98, d * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.06} transparent />
      </mesh>
    </group>
  );
}

// Y형 박스 (서랍형 슬라이드 박스)
// 실제 Y형 박스: 외부 케이스 안에 서랍이 들어가는 고급 구조, 화장품/주얼리 등에 사용
function YTypeBox({ drawerOffset }: { drawerOffset: number }) {
  const w = 2.2,
    h = 1.5,
    d = 2.2;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const wallT = 0.1; // 벽 두께

  // 외부 케이스 (슬리브)
  const outerVerts: [number, number, number][] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, hh, -hd],
    [-hw, hh, -hd],
    [-hw, -hh, hd],
    [hw, -hh, hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  // 케이스 내부 구조 라인 (깊이감)
  const caseInner: [[number, number, number], [number, number, number]][] = [
    // 뒷면 내부
    [
      [-hw + wallT, -hh + wallT, hd - wallT],
      [hw - wallT, -hh + wallT, hd - wallT],
    ],
    [
      [hw - wallT, -hh + wallT, hd - wallT],
      [hw - wallT, hh - wallT, hd - wallT],
    ],
    [
      [hw - wallT, hh - wallT, hd - wallT],
      [-hw + wallT, hh - wallT, hd - wallT],
    ],
    [
      [-hw + wallT, hh - wallT, hd - wallT],
      [-hw + wallT, -hh + wallT, hd - wallT],
    ],
  ];

  // 서랍 (앞으로 빠짐)
  const drawerW = w - wallT * 2 - 0.04;
  const drawerH = h - wallT * 2 - 0.04;
  const drawerD = d - wallT - 0.1;
  const dhw = drawerW / 2,
    dhh = drawerH / 2;
  const dz = -drawerOffset;

  // 서랍 본체
  const drawerVerts: [number, number, number][] = [
    [-dhw, -dhh, -hd + wallT + dz],
    [dhw, -dhh, -hd + wallT + dz],
    [dhw, dhh, -hd + wallT + dz],
    [-dhw, dhh, -hd + wallT + dz],
    [-dhw, -dhh, -hd + wallT + drawerD + dz],
    [dhw, -dhh, -hd + wallT + drawerD + dz],
    [dhw, dhh, -hd + wallT + drawerD + dz],
    [-dhw, dhh, -hd + wallT + drawerD + dz],
  ];

  // 서랍 손잡이 (앞면 리본/손잡이 홀)
  const handleY = 0;
  const handleW = 0.4;
  const handleH = 0.15;
  const handleZ = -hd + wallT + dz - 0.01;
  const handleVerts: [number, number, number][] = [
    [-handleW / 2, handleY - handleH / 2, handleZ],
    [handleW / 2, handleY - handleH / 2, handleZ],
    [handleW / 2, handleY + handleH / 2, handleZ],
    [-handleW / 2, handleY + handleH / 2, handleZ],
  ];

  // 서랍 내부 바닥 라인
  const drawerInner: [[number, number, number], [number, number, number]][] = [
    [
      [-dhw + 0.05, -dhh + 0.05, -hd + wallT + dz + 0.05],
      [dhw - 0.05, -dhh + 0.05, -hd + wallT + dz + 0.05],
    ],
    [
      [dhw - 0.05, -dhh + 0.05, -hd + wallT + dz + 0.05],
      [dhw - 0.05, -dhh + 0.05, -hd + wallT + drawerD + dz - 0.05],
    ],
    [
      [dhw - 0.05, -dhh + 0.05, -hd + wallT + drawerD + dz - 0.05],
      [-dhw + 0.05, -dhh + 0.05, -hd + wallT + drawerD + dz - 0.05],
    ],
    [
      [-dhw + 0.05, -dhh + 0.05, -hd + wallT + drawerD + dz - 0.05],
      [-dhw + 0.05, -dhh + 0.05, -hd + wallT + dz + 0.05],
    ],
  ];

  const boxEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
    [v[4], v[5]],
    [v[5], v[6]],
    [v[6], v[7]],
    [v[7], v[4]],
    [v[0], v[4]],
    [v[1], v[5]],
    [v[2], v[6]],
    [v[3], v[7]],
  ];

  const rectEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
  ];

  return (
    <group>
      {/* 외부 케이스 */}
      {boxEdges(outerVerts).map((e, i) => (
        <Line key={`outer-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}

      {/* 케이스 내부 (깊이감) */}
      {caseInner.map((e, i) => (
        <Line key={`case-inner-${i}`} points={e} color="#ED6C00" lineWidth={1} />
      ))}

      {/* 서랍 */}
      {boxEdges(drawerVerts).map((e, i) => (
        <Line key={`drawer-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}

      {/* 서랍 내부 바닥 */}
      {drawerInner.map((e, i) => (
        <Line key={`drawer-inner-${i}`} points={e} color="#ED6C00" lineWidth={0.8} />
      ))}

      {/* 손잡이 */}
      {rectEdges(handleVerts).map((e, i) => (
        <Line key={`handle-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}

      {/* 반투명 면 */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w * 0.98, h * 0.98, d * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.04} transparent />
      </mesh>
      <mesh position={[0, 0, -hd + wallT + drawerD / 2 + dz]}>
        <boxGeometry args={[drawerW * 0.98, drawerH * 0.98, drawerD * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.08} transparent />
      </mesh>
    </group>
  );
}

// S형 박스 (슬리브 + 트레이 형태)
// 실제 S형 박스: 슬리브(커버)가 내부 트레이를 감싸는 구조, 담배갑/카드박스 등에 사용
function STypeBox({ slideOffset }: { slideOffset: number }) {
  const w = 2.4,
    h = 0.8,
    d = 3.2;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const wallT = 0.06;

  // 슬리브 (외부 커버) - 위아래가 열린 형태
  const sleeveVerts: [number, number, number][] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, hh, -hd],
    [-hw, hh, -hd],
    [-hw, -hh, hd],
    [hw, -hh, hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  // 슬리브 내부 라인
  const sleeveInner: [[number, number, number], [number, number, number]][] = [
    [
      [-hw + wallT, -hh + wallT, -hd],
      [hw - wallT, -hh + wallT, -hd],
    ],
    [
      [hw - wallT, -hh + wallT, -hd],
      [hw - wallT, hh - wallT, -hd],
    ],
    [
      [hw - wallT, hh - wallT, -hd],
      [-hw + wallT, hh - wallT, -hd],
    ],
    [
      [-hw + wallT, hh - wallT, -hd],
      [-hw + wallT, -hh + wallT, -hd],
    ],
    [
      [-hw + wallT, -hh + wallT, hd],
      [hw - wallT, -hh + wallT, hd],
    ],
    [
      [hw - wallT, -hh + wallT, hd],
      [hw - wallT, hh - wallT, hd],
    ],
    [
      [hw - wallT, hh - wallT, hd],
      [-hw + wallT, hh - wallT, hd],
    ],
    [
      [-hw + wallT, hh - wallT, hd],
      [-hw + wallT, -hh + wallT, hd],
    ],
  ];

  // 내부 트레이 (슬리브에서 밀려나옴)
  const trayW = w - wallT * 2 - 0.04;
  const trayH = h - wallT * 2 - 0.02;
  const trayD = d * 0.95;
  const thw = trayW / 2,
    thh = trayH / 2,
    thd = trayD / 2;
  const tz = slideOffset;

  // 트레이 본체
  const trayVerts: [number, number, number][] = [
    [-thw, -thh, -thd + tz],
    [thw, -thh, -thd + tz],
    [thw, thh, -thd + tz],
    [-thw, thh, -thd + tz],
    [-thw, -thh, thd + tz],
    [thw, -thh, thd + tz],
    [thw, thh, thd + tz],
    [-thw, thh, thd + tz],
  ];

  // 트레이 내부 바닥 (제품이 놓이는 곳)
  const trayInnerH = 0.05;
  const trayInner: [[number, number, number], [number, number, number]][] = [
    [
      [-thw + 0.05, -thh + trayInnerH, -thd + tz + 0.05],
      [thw - 0.05, -thh + trayInnerH, -thd + tz + 0.05],
    ],
    [
      [thw - 0.05, -thh + trayInnerH, -thd + tz + 0.05],
      [thw - 0.05, -thh + trayInnerH, thd + tz - 0.05],
    ],
    [
      [thw - 0.05, -thh + trayInnerH, thd + tz - 0.05],
      [-thw + 0.05, -thh + trayInnerH, thd + tz - 0.05],
    ],
    [
      [-thw + 0.05, -thh + trayInnerH, thd + tz - 0.05],
      [-thw + 0.05, -thh + trayInnerH, -thd + tz + 0.05],
    ],
  ];

  // 트레이 앞면 탭 (당기는 부분)
  const tabW = 0.6;
  const tabH = 0.2;
  const tabVerts: [number, number, number][] = [
    [-tabW / 2, -thh, -thd + tz],
    [tabW / 2, -thh, -thd + tz],
    [tabW / 2, -thh - tabH, -thd + tz - 0.1],
    [-tabW / 2, -thh - tabH, -thd + tz - 0.1],
  ];

  const boxEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
    [v[4], v[5]],
    [v[5], v[6]],
    [v[6], v[7]],
    [v[7], v[4]],
    [v[0], v[4]],
    [v[1], v[5]],
    [v[2], v[6]],
    [v[3], v[7]],
  ];

  const rectEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
  ];

  return (
    <group>
      {/* 슬리브 */}
      {boxEdges(sleeveVerts).map((e, i) => (
        <Line key={`sleeve-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}

      {/* 슬리브 내부 */}
      {sleeveInner.map((e, i) => (
        <Line key={`sleeve-inner-${i}`} points={e} color="#ED6C00" lineWidth={1} />
      ))}

      {/* 트레이 */}
      {boxEdges(trayVerts).map((e, i) => (
        <Line key={`tray-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}

      {/* 트레이 내부 바닥 */}
      {trayInner.map((e, i) => (
        <Line key={`tray-inner-${i}`} points={e} color="#ED6C00" lineWidth={0.8} />
      ))}

      {/* 트레이 탭 */}
      {rectEdges(tabVerts).map((e, i) => (
        <Line key={`tab-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}

      {/* 반투명 면 */}
      <mesh>
        <boxGeometry args={[w * 0.98, h * 0.98, d * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.04} transparent />
      </mesh>
      <mesh position={[0, 0, tz]}>
        <boxGeometry args={[trayW * 0.98, trayH * 0.98, trayD * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.08} transparent />
      </mesh>
    </group>
  );
}

// 표지바리 박스 (손잡이 케이크박스)
// 실제 표지바리: 원단/종이로 감싸고 손잡이가 달린 고급 케이크박스/선물박스
function PojibariBox() {
  const w = 2.4,
    h = 1.6,
    d = 2.4;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const wallT = 0.08;

  // 본체 (정사각형에 가까운 케이크박스 형태)
  const bodyVerts: [number, number, number][] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, hh, -hd],
    [-hw, hh, -hd],
    [-hw, -hh, hd],
    [hw, -hh, hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  // 내부 공간 라인 (깊이감)
  const innerBox: [[number, number, number], [number, number, number]][] = [
    [
      [-hw + wallT, -hh + wallT, -hd + wallT],
      [hw - wallT, -hh + wallT, -hd + wallT],
    ],
    [
      [hw - wallT, -hh + wallT, -hd + wallT],
      [hw - wallT, -hh + wallT, hd - wallT],
    ],
    [
      [hw - wallT, -hh + wallT, hd - wallT],
      [-hw + wallT, -hh + wallT, hd - wallT],
    ],
    [
      [-hw + wallT, -hh + wallT, hd - wallT],
      [-hw + wallT, -hh + wallT, -hd + wallT],
    ],
  ];

  // 상단 테두리 장식 라인
  const topTrim: [[number, number, number], [number, number, number]][] = [
    [
      [-hw + 0.05, hh - 0.02, -hd + 0.05],
      [hw - 0.05, hh - 0.02, -hd + 0.05],
    ],
    [
      [hw - 0.05, hh - 0.02, -hd + 0.05],
      [hw - 0.05, hh - 0.02, hd - 0.05],
    ],
    [
      [hw - 0.05, hh - 0.02, hd - 0.05],
      [-hw + 0.05, hh - 0.02, hd - 0.05],
    ],
    [
      [-hw + 0.05, hh - 0.02, hd - 0.05],
      [-hw + 0.05, hh - 0.02, -hd + 0.05],
    ],
  ];

  // 손잡이 (정교한 아치형)
  const handleH = 0.7;
  const handleW = 0.8;
  const hhw = handleW / 2;

  // 손잡이 기본 위치
  const handleBaseY = hh;
  const handleTopY = handleBaseY + handleH;

  // 좌측 손잡이 기둥
  const leftPole: [[number, number, number], [number, number, number]] = [
    [-hhw, handleBaseY, 0],
    [-hhw, handleTopY - 0.1, 0],
  ];

  // 우측 손잡이 기둥
  const rightPole: [[number, number, number], [number, number, number]] = [
    [hhw, handleBaseY, 0],
    [hhw, handleTopY - 0.1, 0],
  ];

  // 손잡이 상단 (부드러운 곡선 대신 다각선으로 표현)
  const handleTopPoints: [number, number, number][] = [
    [-hhw, handleTopY - 0.1, 0],
    [-hhw * 0.7, handleTopY, 0],
    [-hhw * 0.3, handleTopY + 0.05, 0],
    [0, handleTopY + 0.08, 0],
    [hhw * 0.3, handleTopY + 0.05, 0],
    [hhw * 0.7, handleTopY, 0],
    [hhw, handleTopY - 0.1, 0],
  ];

  // 손잡이 구멍 (뚜껑에 손잡이가 통과하는 슬롯)
  const slotW = 0.5;
  const slotD = 0.15;
  const slotVerts: [number, number, number][] = [
    [-slotW / 2, hh + 0.01, -slotD / 2],
    [slotW / 2, hh + 0.01, -slotD / 2],
    [slotW / 2, hh + 0.01, slotD / 2],
    [-slotW / 2, hh + 0.01, slotD / 2],
  ];

  const boxEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
    [v[4], v[5]],
    [v[5], v[6]],
    [v[6], v[7]],
    [v[7], v[4]],
    [v[0], v[4]],
    [v[1], v[5]],
    [v[2], v[6]],
    [v[3], v[7]],
  ];

  const rectEdges = (
    v: [number, number, number][]
  ): [[number, number, number], [number, number, number]][] => [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[3]],
    [v[3], v[0]],
  ];

  return (
    <group>
      {/* 본체 */}
      {boxEdges(bodyVerts).map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}

      {/* 내부 바닥 (깊이감) */}
      {innerBox.map((e, i) => (
        <Line key={`inner-${i}`} points={e} color="#ED6C00" lineWidth={1} />
      ))}

      {/* 상단 테두리 장식 */}
      {topTrim.map((e, i) => (
        <Line key={`trim-${i}`} points={e} color="#ED6C00" lineWidth={1.2} />
      ))}

      {/* 손잡이 기둥 */}
      <Line points={leftPole} color="#ED6C00" lineWidth={2.5} />
      <Line points={rightPole} color="#ED6C00" lineWidth={2.5} />

      {/* 손잡이 상단 곡선 */}
      <Line points={handleTopPoints} color="#ED6C00" lineWidth={3} />

      {/* 손잡이 구멍 */}
      {rectEdges(slotVerts).map((e, i) => (
        <Line
          key={`slot-${i}`}
          points={e}
          color="#ED6C00"
          lineWidth={1}
          dashed
          dashSize={0.05}
          gapSize={0.03}
        />
      ))}

      {/* 반투명 면 */}
      <mesh>
        <boxGeometry args={[w * 0.98, h * 0.98, d * 0.98]} />
        <meshBasicMaterial color="#ED6C00" opacity={0.06} transparent />
      </mesh>
    </group>
  );
}

// 메인 CAD 박스 컴포넌트 - 여러 박스 타입 순환
function CADBox() {
  const groupRef = useRef<THREE.Group>(null);
  const boxContainerRef = useRef<THREE.Group>(null);
  const mouse = useContext(MouseContext);
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'fadeOut' | 'fadeIn'>('idle');
  const [displayType, setDisplayType] = useState(0);
  const targetRotation = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const actionProgressRef = useRef(0);

  // 6초마다 박스 타입 변경 (전환 시간 포함)
  useEffect(() => {
    const interval = setInterval(() => {
      setTransitionPhase('fadeOut');
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // 전환 단계 처리
  useEffect(() => {
    if (transitionPhase === 'fadeOut') {
      // 페이드아웃 완료 후 타입 변경
      const timeout = setTimeout(() => {
        setDisplayType((prev: number) => (prev + 1) % BOX_TYPES.length);
        actionProgressRef.current = 0;
        setTransitionPhase('fadeIn');
      }, 500);
      return () => clearTimeout(timeout);
    } else if (transitionPhase === 'fadeIn') {
      // 페이드인 완료 후 idle
      const timeout = setTimeout(() => {
        setTransitionPhase('idle');
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [transitionPhase]);

  // 전환 회전 값
  const transitionRotationRef = useRef(0);

  useFrame((state, delta) => {
    if (groupRef.current) {
      // 마우스에 따른 회전
      targetRotation.current.x = mouse.y * 0.3;
      targetRotation.current.y = state.clock.elapsedTime * 0.08 + mouse.x * 0.5;

      groupRef.current.rotation.x = lerp(
        groupRef.current.rotation.x,
        targetRotation.current.x,
        0.05
      );
      groupRef.current.rotation.y = lerp(
        groupRef.current.rotation.y,
        targetRotation.current.y,
        0.05
      );
    }

    // 전환 애니메이션 (3D 플립 + 스케일)
    if (transitionPhase === 'fadeOut') {
      // 빠르게 회전하면서 축소
      scaleRef.current = lerp(scaleRef.current, 0.3, 0.12);
      transitionRotationRef.current += delta * 8; // 빠른 회전
    } else if (transitionPhase === 'fadeIn') {
      // 회전 속도 감소하며 확대
      scaleRef.current = lerp(scaleRef.current, 1, 0.08);
      transitionRotationRef.current += delta * 4; // 느려지는 회전
    } else {
      // idle 상태에서 박스 동작 애니메이션
      actionProgressRef.current += delta * 0.15;
      if (actionProgressRef.current > 1) actionProgressRef.current = 1;
      // 회전값 천천히 감쇠
      transitionRotationRef.current *= 0.95;
    }

    // 박스 컨테이너에 스케일과 추가 회전 적용
    if (boxContainerRef.current) {
      boxContainerRef.current.scale.setScalar(scaleRef.current);
      boxContainerRef.current.rotation.y = transitionRotationRef.current;
    }
  });

  // 부드러운 easeInOutCubic
  const easeInOutCubic = (t: number) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // 박스 동작 애니메이션 값 (열리고 유지되는 효과)
  const actionValue = easeInOutCubic(Math.min(actionProgressRef.current * 1.5, 1));
  const boxType = BOX_TYPES[displayType];

  const renderBox = () => {
    switch (boxType) {
      case 'B':
        return <BTypeBox lidAngle={15 + actionValue * 75} />;
      case 'A':
        return <ATypeBox lidOffset={0.05 + actionValue * 0.9} />;
      case 'G':
        return <GTypeBox lidAngle={actionValue * 80} />;
      case 'Y':
        return <YTypeBox drawerOffset={actionValue * 1.0} />;
      case 'S':
        return <STypeBox slideOffset={actionValue * 1.2 - 0.6} />;
      case 'POJIBARI':
        return <PojibariBox />;
      default:
        return <BTypeBox lidAngle={45} />;
    }
  };

  return (
    <group ref={groupRef} position={[0, 0.5, 0]}>
      <group ref={boxContainerRef}>{renderBox()}</group>
    </group>
  );
}

// 유기적으로 움직이는 파티클
function FloatingParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const mouse = useContext(MouseContext);

  const particleCount = 50;

  // 각 파티클의 초기 위치와 움직임 파라미터
  const particleData = useMemo(() => {
    const data = [];
    for (let i = 0; i < particleCount; i++) {
      data.push({
        baseX: (Math.random() - 0.5) * 25,
        baseY: (Math.random() - 0.5) * 12 + 2,
        baseZ: (Math.random() - 0.5) * 25,
        speedX: 0.3 + Math.random() * 0.5,
        speedY: 0.2 + Math.random() * 0.4,
        speedZ: 0.25 + Math.random() * 0.45,
        amplitudeX: 0.5 + Math.random() * 1.5,
        amplitudeY: 0.3 + Math.random() * 1.0,
        amplitudeZ: 0.5 + Math.random() * 1.5,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseZ: Math.random() * Math.PI * 2,
      });
    }
    return data;
  }, []);

  const positions = useMemo(() => new Float32Array(particleCount * 3), []);

  useFrame((state) => {
    if (particlesRef.current) {
      const time = state.clock.elapsedTime;
      const geometry = particlesRef.current.geometry;
      const positionAttribute = geometry.attributes.position;

      for (let i = 0; i < particleCount; i++) {
        const p = particleData[i];

        const x =
          p.baseX +
          Math.sin(time * p.speedX + p.phaseX) * p.amplitudeX +
          Math.cos(time * p.speedZ * 0.5 + p.phaseZ) * p.amplitudeX * 0.3;

        const y =
          p.baseY +
          Math.sin(time * p.speedY + p.phaseY) * p.amplitudeY +
          Math.cos(time * p.speedX * 0.7 + p.phaseX) * p.amplitudeY * 0.5;

        const z =
          p.baseZ +
          Math.cos(time * p.speedZ + p.phaseZ) * p.amplitudeZ +
          Math.sin(time * p.speedY * 0.6 + p.phaseY) * p.amplitudeZ * 0.4;

        const mouseInfluence = 1.5;
        const mouseX = mouse.x * mouseInfluence * (1 + Math.sin(p.phaseX) * 0.5);
        const mouseY = mouse.y * mouseInfluence * (1 + Math.cos(p.phaseY) * 0.5);

        positions[i * 3] = x + mouseX;
        positions[i * 3 + 1] = y + mouseY * 0.5;
        positions[i * 3 + 2] = z;
      }

      const posArray = positionAttribute.array as Float32Array;
      for (let i = 0; i < particleCount * 3; i++) {
        posArray[i] = positions[i];
      }
      positionAttribute.needsUpdate = true;
    }
  });

  useMemo(() => {
    particleData.forEach((p, i) => {
      positions[i * 3] = p.baseX;
      positions[i * 3 + 1] = p.baseY;
      positions[i * 3 + 2] = p.baseZ;
    });
  }, [particleData, positions]);

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#ED6C00"
        transparent
        opacity={0.7}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// 연결선이 있는 파티클 네트워크 - 성능 최적화
function ParticleNetwork() {
  const groupRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<THREE.InstancedMesh>(null);
  const mouse = useContext(MouseContext);

  const nodeCount = 10; // 15 -> 10으로 줄임
  const connectionDistance = 5;

  // 노드 위치와 움직임 파라미터 (한 번만 생성)
  const nodeData = useMemo(() => {
    const data = [];
    for (let i = 0; i < nodeCount; i++) {
      data.push({
        baseX: (Math.random() - 0.5) * 16,
        baseY: (Math.random() - 0.5) * 8 + 1,
        baseZ: (Math.random() - 0.5) * 16,
        speed: 0.2 + Math.random() * 0.3,
        amplitude: 0.8 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return data;
  }, []);

  // 현재 위치 저장용 (state 대신 ref 사용 - 성능 최적화)
  const nodePositionsRef = useRef<Float32Array>(new Float32Array(nodeCount * 3));
  const connectionsRef = useRef<Array<[[number, number, number], [number, number, number]]>>([]);
  const [, forceUpdate] = useState(0);
  const updateCounter = useRef(0);

  // 임시 Vector3 (매 프레임 새로 생성하지 않음)
  const tempVec1 = useMemo(() => new THREE.Vector3(), []);
  const tempVec2 = useMemo(() => new THREE.Vector3(), []);
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const positions = nodePositionsRef.current;

    // 노드 위치 업데이트 (ref로 직접 수정)
    for (let i = 0; i < nodeCount; i++) {
      const n = nodeData[i];
      positions[i * 3] = n.baseX + Math.sin(time * n.speed + n.phase) * n.amplitude + mouse.x * 0.5;
      positions[i * 3 + 1] =
        n.baseY + Math.cos(time * n.speed * 0.7 + n.phase) * n.amplitude * 0.5 + mouse.y * 0.3;
      positions[i * 3 + 2] = n.baseZ + Math.sin(time * n.speed * 0.5 + n.phase * 1.5) * n.amplitude;
    }

    // InstancedMesh 업데이트
    if (nodesRef.current) {
      for (let i = 0; i < nodeCount; i++) {
        tempMatrix.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        nodesRef.current.setMatrixAt(i, tempMatrix);
      }
      nodesRef.current.instanceMatrix.needsUpdate = true;
    }

    // 연결선 계산 (5프레임마다 한 번만 - 성능 최적화)
    updateCounter.current++;
    if (updateCounter.current % 5 === 0) {
      const newConnections: Array<[[number, number, number], [number, number, number]]> = [];
      for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < nodeCount; j++) {
          tempVec1.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
          tempVec2.set(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
          const dist = tempVec1.distanceTo(tempVec2);
          if (dist < connectionDistance) {
            newConnections.push([
              [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]],
              [positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]],
            ]);
          }
        }
      }
      connectionsRef.current = newConnections;
      forceUpdate((v) => v + 1);
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.02;
    }
  });

  return (
    <group ref={groupRef}>
      {/* InstancedMesh로 노드 렌더링 (성능 최적화) */}
      <instancedMesh ref={nodesRef} args={[undefined, undefined, nodeCount]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshBasicMaterial color="#ED6C00" transparent opacity={0.8} />
      </instancedMesh>

      {/* 연결선 */}
      {connectionsRef.current.map((conn, i) => (
        <Line
          key={`conn-${i}`}
          points={conn}
          color="#ED6C00"
          lineWidth={0.5}
          transparent
          opacity={0.3}
        />
      ))}
    </group>
  );
}

// 그리드 바닥
function CADGrid() {
  const gridRef = useRef<THREE.Group>(null);
  const mouse = useContext(MouseContext);

  useFrame(() => {
    if (gridRef.current) {
      // 그리드도 마우스에 따라 살짝 기울어짐
      gridRef.current.rotation.x = -Math.PI / 2 + mouse.y * 0.05;
      gridRef.current.rotation.z = mouse.x * 0.02;
    }
  });

  return (
    <group ref={gridRef} position={[0, -2.5, 0]}>
      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#ED6C00"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#ED6C00"
        fadeDistance={15}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={true}
      />
    </group>
  );
}

// 3D 바닥면 (공간감 표현)
function Floor() {
  return (
    <group position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* 반사 효과가 있는 바닥 */}
      <mesh receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial color="#0a0a0a" transparent opacity={0.6} />
      </mesh>
      {/* 바닥 테두리 라인 */}
      <Line
        points={[
          [-10, -10, 0.01],
          [10, -10, 0.01],
          [10, 10, 0.01],
          [-10, 10, 0.01],
          [-10, -10, 0.01],
        ]}
        color="#ED6C00"
        lineWidth={1}
        transparent
        opacity={0.3}
      />
      {/* 중심 십자 라인 */}
      <Line
        points={[
          [-10, 0, 0.01],
          [10, 0, 0.01],
        ]}
        color="#ED6C00"
        lineWidth={0.5}
        transparent
        opacity={0.2}
      />
      <Line
        points={[
          [0, -10, 0.01],
          [0, 10, 0.01],
        ]}
        color="#ED6C00"
        lineWidth={0.5}
        transparent
        opacity={0.2}
      />
    </group>
  );
}

// 3D 씬
function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />

      {/* 마우스 따라가는 카메라 */}
      <MouseCamera />

      {/* 3D 바닥면 */}
      <Floor />

      {/* CAD 스타일 그리드 */}
      <CADGrid />

      {/* 유기적 플로팅 파티클 */}
      <FloatingParticles />

      {/* 파티클 네트워크 (노드 + 연결선) */}
      <ParticleNetwork />

      {/* 메인 와이어프레임 박스 */}
      <CADBox />
    </>
  );
}

export default function HeroThreeSection() {
  const [isClient, setIsClient] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setIsClient(true);

    const handleMouseMove = (e: MouseEvent) => {
      // 마우스 위치를 -1 ~ 1 범위로 정규화
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <section data-header-theme="dark" className="relative h-screen w-full overflow-hidden bg-black">
      {/* 배경 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-black to-gray-900" />

      {/* 3D 캔버스 - 전체 화면 배경으로 */}
      {isClient && (
        <div className="absolute inset-0 z-0">
          <MouseContext.Provider value={mousePosition}>
            <Canvas
              camera={{ position: [6, 4, 6], fov: 50 }}
              gl={{ antialias: true, alpha: true }}
              dpr={[1, 2]}
            >
              <Scene />
            </Canvas>
          </MouseContext.Provider>
        </div>
      )}

      {/* 왼쪽 그라데이션 오버레이 (텍스트 가독성) */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent z-[1]" />

      {/* 텍스트 컨텐츠 - 왼쪽 배치 */}
      <div className="relative z-10 h-full flex items-center">
        <div className="px-4 sm:px-6 lg:px-12">
          <div className="max-w-2xl">
            {/* 장식 라인 */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="w-24 h-[2px] bg-gradient-to-r from-[#ED6C00] to-transparent mb-8 origin-left"
            />

            {/* 서브타이틀 */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-[#ED6C00] text-sm md:text-base font-medium tracking-[0.3em] uppercase mb-6"
            >
              package structure solution
            </motion.p>

            {/* 메인 타이틀 */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-6 leading-[1.0] tracking-tight"
            >
              <span className="block">패키지 완성도</span>
              <span className="block mt-2">
                <span className="text-[#ED6C00]">지기구조 설계</span>
                <span className="text-white">로</span>
              </span>
              <span className="block mt-2 bg-gradient-to-r from-white via-gray-200 to-white bg-clip-text text-transparent">
                결정된다
              </span>
            </motion.h1>

            {/* 설명 */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.8 }}
              className="text-gray-400 text-base md:text-lg max-w-xl mb-10 leading-relaxed"
            >
              21년 경력의 전문 지기구조 설계로
              <br className="hidden md:block" />
              제품의 가치를 높이는 맞춤형 패키지 솔루션을 제공합니다.
            </motion.p>

            {/* CTA 버튼 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.6 }}
              className="flex flex-col sm:flex-row items-start gap-4"
            >
              <Link
                href="/contact"
                className="group px-6 py-3 text-sm bg-[#ED6C00] text-white font-semibold rounded-full hover:bg-[#d15f00] transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105"
              >
                <span className="flex items-center gap-2">
                  문의하기
                  <svg
                    className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </span>
              </Link>
              <Link
                href="/portfolio"
                className="px-6 py-3 text-sm border border-white/30 text-white font-medium rounded-full hover:bg-white/10 hover:border-white/50 transition-all duration-300 backdrop-blur-sm"
              >
                포트폴리오 보기
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      {/* 스크롤 인디케이터 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="text-white/40 text-xs font-medium tracking-[0.2em] uppercase">
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2"
          >
            <motion.div
              animate={{ opacity: [1, 0.3, 1], y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1 h-2 bg-white/60 rounded-full"
            />
          </motion.div>
        </div>
      </motion.div>

      {/* 장식 요소 */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/50 to-transparent z-[5] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/50 to-transparent z-[5] pointer-events-none" />
    </section>
  );
}
