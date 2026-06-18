'use client';

import { useRef, useMemo, createContext, useContext } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, Grid } from '@react-three/drei';
import * as THREE from 'three';

// 마우스 위치를 공유하기 위한 Context
export const MouseContext = createContext({ x: 0, y: 0 });

// 박스 타입 정의 (레퍼런스 기준 10가지)
type BoxType = 'A' | 'B' | 'Y' | 'R' | 'G' | 'M' | 'C' | 'S' | 'BW' | 'CUSTOM';

// 부드러운 보간을 위한 lerp 함수
function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

// 마우스 따라가는 카메라
function MouseCamera() {
  const { camera } = useThree();
  const mouse = useContext(MouseContext);
  const isMobile = useContext(MobileContext);
  const isLargeScreen = useContext(LargeScreenContext);
  const targetPosition = useRef(new THREE.Vector3(6, 4, 6));

  useFrame(() => {
    if (isMobile) {
      // 모바일: 위에서 내려다보는 시점 (박스 전체가 보이도록)
      const targetX = 0 + mouse.x * 0.5;
      const targetY = 5 + mouse.y * 0.3;
      const targetZ = 7;
      targetPosition.current.set(targetX, targetY, targetZ);
    } else if (isLargeScreen) {
      // 큰 화면: 카메라를 더 가깝게, 박스가 더 중앙에 오도록
      const targetX = 4 + mouse.x * 1.5;
      const targetY = 3.5 + mouse.y * 0.8;
      const targetZ = 5 + mouse.x * 0.4;
      targetPosition.current.set(targetX, targetY, targetZ);
    } else {
      // 일반 데스크탑: 기존 로직
      const targetX = 6 + mouse.x * 2;
      const targetY = 4 + mouse.y * 1;
      const targetZ = 6 + mouse.x * 0.5;
      targetPosition.current.set(targetX, targetY, targetZ);
    }

    camera.position.lerp(targetPosition.current, 0.05);
    // 모바일에서는 박스 중심을 바라보도록
    camera.lookAt(0, isMobile ? 0.5 : 0, 0);
  });

  return null;
}

// A형 - 일반 골판지 박스 (날개 열린 상태)
function ATypeBox({ lidAngle }: { lidAngle: number }) {
  const w = 2.2,
    h = 1.6,
    d = 1.8;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const flapH = hd * 0.9;

  const lidRad = (lidAngle * Math.PI) / 180;
  const cosL = Math.cos(lidRad);
  const sinL = Math.sin(lidRad);

  // 본체 꼭짓점
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

  // 상단 날개들
  const topFrontFlap: [number, number, number][] = [
    [-hw + 0.02, hh, -hd],
    [hw - 0.02, hh, -hd],
    [hw - 0.02, hh + flapH * cosL, -hd + flapH * sinL],
    [-hw + 0.02, hh + flapH * cosL, -hd + flapH * sinL],
  ];

  const topBackFlap: [number, number, number][] = [
    [-hw + 0.02, hh, hd],
    [hw - 0.02, hh, hd],
    [hw - 0.02, hh + flapH * cosL, hd - flapH * sinL],
    [-hw + 0.02, hh + flapH * cosL, hd - flapH * sinL],
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
      {bodyEdges.map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {flapEdges(topFrontFlap).map((e, i) => (
        <Line key={`tf-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
      {flapEdges(topBackFlap).map((e, i) => (
        <Line key={`tb-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
    </group>
  );
}

// B형 - 싸바리/조립형 박스 (뚜껑 분리)
function BTypeBox({ lidOffset }: { lidOffset: number }) {
  const w = 2,
    h = 1.4,
    d = 1.8;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const lidH = 0.4;
  const wallGap = 0.08;

  // 본체
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

  // 뚜껑
  const lidW = w + wallGap * 2,
    lidD = d + wallGap * 2;
  const lhw = lidW / 2,
    lhd = lidD / 2;
  const lidBaseY = hh - 0.35 + lidOffset;

  const lidVerts: [number, number, number][] = [
    [-lhw, lidBaseY, -lhd],
    [lhw, lidBaseY, -lhd],
    [lhw, lidBaseY + lidH + 0.35, -lhd],
    [-lhw, lidBaseY + lidH + 0.35, -lhd],
    [-lhw, lidBaseY, lhd],
    [lhw, lidBaseY, lhd],
    [lhw, lidBaseY + lidH + 0.35, lhd],
    [-lhw, lidBaseY + lidH + 0.35, lhd],
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
      {boxEdges(bottomVerts).map((e, i) => (
        <Line key={`bottom-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {boxEdges(lidVerts).map((e, i) => (
        <Line key={`lid-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
    </group>
  );
}

// Y형 - 선물세트 박스 (칸막이 있는)
function YTypeBox({ lidAngle }: { lidAngle: number }) {
  const w = 2.4,
    h = 1.2,
    d = 2.0;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;

  const rad = (lidAngle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 본체
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

  // 칸막이 (십자형)
  const dividers: [[number, number, number], [number, number, number]][] = [
    [
      [0, -hh + 0.02, -hd + 0.02],
      [0, hh - 0.02, -hd + 0.02],
    ],
    [
      [0, -hh + 0.02, hd - 0.02],
      [0, hh - 0.02, hd - 0.02],
    ],
    [
      [0, -hh + 0.02, -hd + 0.02],
      [0, -hh + 0.02, hd - 0.02],
    ],
    [
      [-hw + 0.02, -hh + 0.02, 0],
      [hw - 0.02, -hh + 0.02, 0],
    ],
    [
      [-hw + 0.02, hh - 0.02, 0],
      [hw - 0.02, hh - 0.02, 0],
    ],
  ];

  // 뚜껑 (힌지형)
  const lidH = 0.15;
  const lhw = hw + 0.04,
    lhd = hd + 0.04;
  const lidVerts: [number, number, number][] = [
    [-lhw, hh, hd],
    [lhw, hh, hd],
    [lhw, hh + lhd * 2 * sin, hd - lhd * 2 * cos],
    [-lhw, hh + lhd * 2 * sin, hd - lhd * 2 * cos],
  ];

  const lidTopVerts: [number, number, number][] = [
    [-lhw, hh + lidH * cos, hd + lidH * sin],
    [lhw, hh + lidH * cos, hd + lidH * sin],
    [lhw, hh + lhd * 2 * sin + lidH * cos, hd - lhd * 2 * cos + lidH * sin],
    [-lhw, hh + lhd * 2 * sin + lidH * cos, hd - lhd * 2 * cos + lidH * sin],
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

  const lidEdges: [[number, number, number], [number, number, number]][] = [
    [lidVerts[0], lidVerts[1]],
    [lidVerts[1], lidVerts[2]],
    [lidVerts[2], lidVerts[3]],
    [lidVerts[3], lidVerts[0]],
    [lidTopVerts[0], lidTopVerts[1]],
    [lidTopVerts[1], lidTopVerts[2]],
    [lidTopVerts[2], lidTopVerts[3]],
    [lidTopVerts[3], lidTopVerts[0]],
    [lidVerts[0], lidTopVerts[0]],
    [lidVerts[1], lidTopVerts[1]],
    [lidVerts[2], lidTopVerts[2]],
    [lidVerts[3], lidTopVerts[3]],
  ];

  return (
    <group>
      {boxEdges(bodyVerts).map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {dividers.map((e, i) => (
        <Line key={`div-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}
      {lidEdges.map((e, i) => (
        <Line key={`lid-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
    </group>
  );
}

// R형 - 손잡이 박스 (케이크박스)
function RTypeBox() {
  const w = 2.4,
    h = 1.6,
    d = 2.4;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;

  // 본체
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

  // 손잡이
  const handleH = 0.7;
  const handleW = 0.8;
  const hhw = handleW / 2;
  const handleBaseY = hh;
  const handleTopY = handleBaseY + handleH;

  const handleTopPoints: [number, number, number][] = [
    [-hhw, handleTopY - 0.1, 0],
    [-hhw * 0.7, handleTopY, 0],
    [-hhw * 0.3, handleTopY + 0.05, 0],
    [0, handleTopY + 0.08, 0],
    [hhw * 0.3, handleTopY + 0.05, 0],
    [hhw * 0.7, handleTopY, 0],
    [hhw, handleTopY - 0.1, 0],
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
      {boxEdges(bodyVerts).map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      <Line
        points={[
          [-hhw, handleBaseY, 0],
          [-hhw, handleTopY - 0.1, 0],
        ]}
        color="#ED6C00"
        lineWidth={2.5}
      />
      <Line
        points={[
          [hhw, handleBaseY, 0],
          [hhw, handleTopY - 0.1, 0],
        ]}
        color="#ED6C00"
        lineWidth={2.5}
      />
      <Line points={handleTopPoints} color="#ED6C00" lineWidth={3} />
    </group>
  );
}

// G형 - 상하 뚜껑 박스
function GTypeBox({ lidAngle }: { lidAngle: number }) {
  const w = 2.2,
    h = 1.4,
    d = 1.8;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const flapH = hd * 0.9;

  const lidRad = (lidAngle * Math.PI) / 180;
  const cosL = Math.cos(lidRad);
  const sinL = Math.sin(lidRad);

  // 본체
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

  // 상단 날개들 (4개)
  const topFront: [number, number, number][] = [
    [-hw + 0.02, hh, -hd],
    [hw - 0.02, hh, -hd],
    [hw - 0.02, hh + flapH * cosL, -hd + flapH * sinL],
    [-hw + 0.02, hh + flapH * cosL, -hd + flapH * sinL],
  ];

  const topBack: [number, number, number][] = [
    [-hw + 0.02, hh, hd],
    [hw - 0.02, hh, hd],
    [hw - 0.02, hh + flapH * cosL, hd - flapH * sinL],
    [-hw + 0.02, hh + flapH * cosL, hd - flapH * sinL],
  ];

  const innerAngle = Math.min(lidAngle * 1.2, 90);
  const innerRad = (innerAngle * Math.PI) / 180;
  const cosI = Math.cos(innerRad);
  const sinI = Math.sin(innerRad);
  const innerFlapH = hw * 0.6;

  const topLeft: [number, number, number][] = [
    [-hw, hh, -hd + 0.02],
    [-hw, hh, hd - 0.02],
    [-hw + innerFlapH * sinI, hh + innerFlapH * cosI, hd - 0.02],
    [-hw + innerFlapH * sinI, hh + innerFlapH * cosI, -hd + 0.02],
  ];

  const topRight: [number, number, number][] = [
    [hw, hh, -hd + 0.02],
    [hw, hh, hd - 0.02],
    [hw - innerFlapH * sinI, hh + innerFlapH * cosI, hd - 0.02],
    [hw - innerFlapH * sinI, hh + innerFlapH * cosI, -hd + 0.02],
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
      {boxEdges(bodyVerts).map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {flapEdges(topFront).map((e, i) => (
        <Line key={`tf-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
      {flapEdges(topBack).map((e, i) => (
        <Line key={`tb-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
      {flapEdges(topLeft).map((e, i) => (
        <Line key={`tl-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}
      {flapEdges(topRight).map((e, i) => (
        <Line key={`tr-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}
    </group>
  );
}

// M형 - 와인/병 박스 (세로형)
function MTypeBox() {
  const w = 1.0,
    h = 2.8,
    d = 1.0;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;

  // 본체
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

  // 손잡이 구멍 (상단에)
  const holeW = 0.3,
    holeH = 0.15;
  const holeY = hh - 0.3;
  const holeVerts: [number, number, number][] = [
    [-holeW / 2, holeY - holeH / 2, -hd - 0.01],
    [holeW / 2, holeY - holeH / 2, -hd - 0.01],
    [holeW / 2, holeY + holeH / 2, -hd - 0.01],
    [-holeW / 2, holeY + holeH / 2, -hd - 0.01],
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
      {boxEdges(bodyVerts).map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {rectEdges(holeVerts).map((e, i) => (
        <Line
          key={`hole-${i}`}
          points={e}
          color="#ED6C00"
          lineWidth={1.5}
          dashed
          dashSize={0.05}
          gapSize={0.03}
        />
      ))}
    </group>
  );
}

// C형 - 피자박스 (뚜껑 열림)
function CTypeBox({ lidAngle }: { lidAngle: number }) {
  const w = 2.8,
    h = 0.5,
    d = 2.8;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;

  const rad = (lidAngle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 바닥 박스
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

  // 뚜껑 (뒷면 힌지)
  const lidH = 0.08;
  const lidVerts: [number, number, number][] = [
    [-hw, hh, hd],
    [hw, hh, hd],
    [hw, hh + hd * 2 * sin, hd - hd * 2 * cos],
    [-hw, hh + hd * 2 * sin, hd - hd * 2 * cos],
  ];

  const lidTopVerts: [number, number, number][] = [
    [-hw, hh + lidH * cos, hd + lidH * sin],
    [hw, hh + lidH * cos, hd + lidH * sin],
    [hw, hh + hd * 2 * sin + lidH * cos, hd - hd * 2 * cos + lidH * sin],
    [-hw, hh + hd * 2 * sin + lidH * cos, hd - hd * 2 * cos + lidH * sin],
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

  const lidEdges: [[number, number, number], [number, number, number]][] = [
    [lidVerts[0], lidVerts[1]],
    [lidVerts[1], lidVerts[2]],
    [lidVerts[2], lidVerts[3]],
    [lidVerts[3], lidVerts[0]],
    [lidTopVerts[0], lidTopVerts[1]],
    [lidTopVerts[1], lidTopVerts[2]],
    [lidTopVerts[2], lidTopVerts[3]],
    [lidTopVerts[3], lidTopVerts[0]],
    [lidVerts[0], lidTopVerts[0]],
    [lidVerts[1], lidTopVerts[1]],
    [lidVerts[2], lidTopVerts[2]],
    [lidVerts[3], lidTopVerts[3]],
  ];

  return (
    <group>
      {boxEdges(bodyVerts).map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {lidEdges.map((e, i) => (
        <Line key={`lid-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
    </group>
  );
}

// S형 - 슬리브 박스
function STypeBox({ slideOffset }: { slideOffset: number }) {
  const w = 2.4,
    h = 0.8,
    d = 3.2;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const wallT = 0.06;

  // 슬리브
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

  // 내부 트레이
  const trayW = w - wallT * 2 - 0.04;
  const trayH = h - wallT * 2 - 0.02;
  const trayD = d * 0.95;
  const thw = trayW / 2,
    thh = trayH / 2,
    thd = trayD / 2;
  const tz = slideOffset;

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
      {boxEdges(sleeveVerts).map((e, i) => (
        <Line key={`sleeve-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {boxEdges(trayVerts).map((e, i) => (
        <Line key={`tray-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
    </group>
  );
}

// BW형 - 택배박스 (열린 상태)
function BWTypeBox({ lidAngle }: { lidAngle: number }) {
  const w = 2.4,
    h = 1.2,
    d = 1.6;
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const flapH = hd * 0.95;

  const lidRad = (lidAngle * Math.PI) / 180;
  const cosL = Math.cos(lidRad);
  const sinL = Math.sin(lidRad);

  // 본체
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

  // 상단 날개들
  const topFront: [number, number, number][] = [
    [-hw + 0.02, hh, -hd],
    [hw - 0.02, hh, -hd],
    [hw - 0.02, hh + flapH * cosL, -hd + flapH * sinL],
    [-hw + 0.02, hh + flapH * cosL, -hd + flapH * sinL],
  ];

  const innerAngle = Math.min(lidAngle * 1.2, 90);
  const innerRad = (innerAngle * Math.PI) / 180;
  const cosI = Math.cos(innerRad);
  const sinI = Math.sin(innerRad);
  const sideFlapH = hw * 0.8;

  const topLeft: [number, number, number][] = [
    [-hw, hh, -hd + 0.02],
    [-hw, hh, hd - 0.02],
    [-hw + sideFlapH * sinI, hh + sideFlapH * cosI, hd - 0.02],
    [-hw + sideFlapH * sinI, hh + sideFlapH * cosI, -hd + 0.02],
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
      {boxEdges(bodyVerts).map((e, i) => (
        <Line key={`body-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
      {flapEdges(topFront).map((e, i) => (
        <Line key={`tf-${i}`} points={e} color="#ED6C00" lineWidth={2} />
      ))}
      {flapEdges(topLeft).map((e, i) => (
        <Line key={`tl-${i}`} points={e} color="#ED6C00" lineWidth={1.5} />
      ))}
    </group>
  );
}

// 커스텀형 - 다각형 특수 박스 (육각형 프리즘)
function CustomTypeBox() {
  const h = 2.0;
  const r = 1.0;

  // 육각형 꼭짓점
  const hexPoints: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    hexPoints.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }

  // 상하단 꼭짓점
  const topVerts: [number, number, number][] = hexPoints.map(([x, z]) => [x, h / 2, z]);
  const bottomVerts: [number, number, number][] = hexPoints.map(([x, z]) => [x, -h / 2, z]);

  // 엣지 생성
  const edges: [[number, number, number], [number, number, number]][] = [];

  // 상단 엣지
  for (let i = 0; i < 6; i++) {
    edges.push([topVerts[i], topVerts[(i + 1) % 6]]);
  }
  // 하단 엣지
  for (let i = 0; i < 6; i++) {
    edges.push([bottomVerts[i], bottomVerts[(i + 1) % 6]]);
  }
  // 수직 엣지
  for (let i = 0; i < 6; i++) {
    edges.push([topVerts[i], bottomVerts[i]]);
  }

  return (
    <group>
      {edges.map((e, i) => (
        <Line key={`edge-${i}`} points={e} color="#ED6C00" lineWidth={2.5} />
      ))}
    </group>
  );
}

// 치수선 컴포넌트
function DimensionLines({ w, h, d }: { w: number; h: number; d: number }) {
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  const offset = 0.3;
  const arrowSize = 0.1;

  const widthLine: [number, number, number][] = [
    [-hw, -hh - offset, -hd - offset],
    [hw, -hh - offset, -hd - offset],
  ];
  const widthArrowLeft: [number, number, number][] = [
    [-hw + arrowSize, -hh - offset + arrowSize * 0.5, -hd - offset],
    [-hw, -hh - offset, -hd - offset],
    [-hw + arrowSize, -hh - offset - arrowSize * 0.5, -hd - offset],
  ];
  const widthArrowRight: [number, number, number][] = [
    [hw - arrowSize, -hh - offset + arrowSize * 0.5, -hd - offset],
    [hw, -hh - offset, -hd - offset],
    [hw - arrowSize, -hh - offset - arrowSize * 0.5, -hd - offset],
  ];
  const widthExtLeft: [[number, number, number], [number, number, number]] = [
    [-hw, -hh, -hd],
    [-hw, -hh - offset - 0.1, -hd - offset - 0.1],
  ];
  const widthExtRight: [[number, number, number], [number, number, number]] = [
    [hw, -hh, -hd],
    [hw, -hh - offset - 0.1, -hd - offset - 0.1],
  ];

  const depthLine: [number, number, number][] = [
    [hw + offset, -hh - offset, -hd],
    [hw + offset, -hh - offset, hd],
  ];
  const depthArrowFront: [number, number, number][] = [
    [hw + offset, -hh - offset + arrowSize * 0.5, -hd + arrowSize],
    [hw + offset, -hh - offset, -hd],
    [hw + offset, -hh - offset - arrowSize * 0.5, -hd + arrowSize],
  ];
  const depthArrowBack: [number, number, number][] = [
    [hw + offset, -hh - offset + arrowSize * 0.5, hd - arrowSize],
    [hw + offset, -hh - offset, hd],
    [hw + offset, -hh - offset - arrowSize * 0.5, hd - arrowSize],
  ];
  const depthExtFront: [[number, number, number], [number, number, number]] = [
    [hw, -hh, -hd],
    [hw + offset + 0.1, -hh - offset - 0.1, -hd],
  ];
  const depthExtBack: [[number, number, number], [number, number, number]] = [
    [hw, -hh, hd],
    [hw + offset + 0.1, -hh - offset - 0.1, hd],
  ];

  const heightLine: [number, number, number][] = [
    [hw + offset, -hh, -hd - offset],
    [hw + offset, hh, -hd - offset],
  ];
  const heightArrowBottom: [number, number, number][] = [
    [hw + offset - arrowSize * 0.5, -hh + arrowSize, -hd - offset],
    [hw + offset, -hh, -hd - offset],
    [hw + offset + arrowSize * 0.5, -hh + arrowSize, -hd - offset],
  ];
  const heightArrowTop: [number, number, number][] = [
    [hw + offset - arrowSize * 0.5, hh - arrowSize, -hd - offset],
    [hw + offset, hh, -hd - offset],
    [hw + offset + arrowSize * 0.5, hh - arrowSize, -hd - offset],
  ];
  const heightExtBottom: [[number, number, number], [number, number, number]] = [
    [hw, -hh, -hd],
    [hw + offset + 0.1, -hh, -hd - offset - 0.1],
  ];
  const heightExtTop: [[number, number, number], [number, number, number]] = [
    [hw, hh, -hd],
    [hw + offset + 0.1, hh, -hd - offset - 0.1],
  ];

  return (
    <group>
      <Line
        points={widthLine}
        color="#ED6C00"
        lineWidth={1}
        dashed
        dashSize={0.08}
        gapSize={0.04}
      />
      <Line points={widthArrowLeft} color="#ED6C00" lineWidth={1.5} />
      <Line points={widthArrowRight} color="#ED6C00" lineWidth={1.5} />
      <Line
        points={widthExtLeft}
        color="#ED6C00"
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
      <Line
        points={widthExtRight}
        color="#ED6C00"
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
      <Line
        points={depthLine}
        color="#ED6C00"
        lineWidth={1}
        dashed
        dashSize={0.08}
        gapSize={0.04}
      />
      <Line points={depthArrowFront} color="#ED6C00" lineWidth={1.5} />
      <Line points={depthArrowBack} color="#ED6C00" lineWidth={1.5} />
      <Line
        points={depthExtFront}
        color="#ED6C00"
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
      <Line
        points={depthExtBack}
        color="#ED6C00"
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
      <Line
        points={heightLine}
        color="#ED6C00"
        lineWidth={1}
        dashed
        dashSize={0.08}
        gapSize={0.04}
      />
      <Line points={heightArrowBottom} color="#ED6C00" lineWidth={1.5} />
      <Line points={heightArrowTop} color="#ED6C00" lineWidth={1.5} />
      <Line
        points={heightExtBottom}
        color="#ED6C00"
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
      <Line
        points={heightExtTop}
        color="#ED6C00"
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
    </group>
  );
}

// 박스 타입 정의
export const BOX_TYPES: { type: BoxType; name: string; description: string }[] = [
  { type: 'A', name: 'A형', description: '일반 골판지 박스' },
  { type: 'B', name: 'B형', description: '싸바리/조립형 박스' },
  { type: 'Y', name: 'Y형', description: '선물세트 박스' },
  { type: 'R', name: 'R형', description: '손잡이 박스' },
  { type: 'G', name: 'G형', description: '상하 뚜껑 박스' },
  { type: 'M', name: 'M형', description: '와인/병 박스' },
  { type: 'C', name: 'C형', description: '피자박스' },
  { type: 'S', name: 'S형', description: '슬리브 박스' },
  { type: 'BW', name: 'BW형', description: '택배박스' },
  { type: 'CUSTOM', name: '커스텀', description: '특수 맞춤형 박스' },
];

// 박스 치수 정보
const BOX_DIMENSIONS: Record<BoxType, { w: number; h: number; d: number }> = {
  A: { w: 2.2, h: 1.6, d: 1.8 },
  B: { w: 2.0, h: 1.4, d: 1.8 },
  Y: { w: 2.4, h: 1.2, d: 2.0 },
  R: { w: 2.4, h: 1.6, d: 2.4 },
  G: { w: 2.2, h: 1.4, d: 1.8 },
  M: { w: 1.0, h: 2.8, d: 1.0 },
  C: { w: 2.8, h: 0.5, d: 2.8 },
  S: { w: 2.4, h: 0.8, d: 3.2 },
  BW: { w: 2.4, h: 1.2, d: 1.6 },
  CUSTOM: { w: 2.0, h: 2.0, d: 2.0 },
};

// 모바일 여부를 공유하기 위한 Context (상단에서 export로 선언됨)
const MobileContext = createContext(false);
// 큰 화면 여부를 공유하기 위한 Context
const LargeScreenContext = createContext(false);

// 메인 박스 컴포넌트
function CADBox({
  currentType,
  actionProgress,
  transitionPhase,
}: {
  currentType: number;
  actionProgress: number;
  transitionPhase: 'idle' | 'slideOut' | 'slideIn';
}) {
  const groupRef = useRef<THREE.Group>(null);
  const boxContainerRef = useRef<THREE.Group>(null);
  const mouse = useContext(MouseContext);
  const isMobile = useContext(MobileContext);
  const isLargeScreen = useContext(LargeScreenContext);
  const targetRotation = useRef({ x: 0, y: 0 });

  const slideProgressRef = useRef(0);
  const opacityProgressRef = useRef(1);
  const transitionStartRef = useRef(0);
  const prevPhaseRef = useRef<'idle' | 'slideOut' | 'slideIn'>('idle');
  const lastOpacityRef = useRef(-1);
  const materialsRef = useRef<(THREE.Material & { opacity?: number })[]>([]);

  const easeIn = (t: number) => t * t * t;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  useFrame((state) => {
    if (groupRef.current) {
      targetRotation.current.x = mouse.y * 0.3;
      targetRotation.current.y = state.clock.elapsedTime * 0.1 + mouse.x * 0.5;

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

    if (prevPhaseRef.current !== transitionPhase) {
      transitionStartRef.current = state.clock.elapsedTime;
      prevPhaseRef.current = transitionPhase;
      materialsRef.current = [];

      if (transitionPhase === 'slideIn') {
        slideProgressRef.current = -10;
        opacityProgressRef.current = 0;
      }
    }

    if (boxContainerRef.current) {
      const elapsed = state.clock.elapsedTime - transitionStartRef.current;

      if (transitionPhase === 'slideOut') {
        const progress = Math.min(elapsed / 0.4, 1);
        const easedProgress = easeIn(progress);
        slideProgressRef.current = easedProgress * 10;
        opacityProgressRef.current = 1 - easedProgress;
      } else if (transitionPhase === 'slideIn') {
        const progress = Math.min(elapsed / 0.6, 1);
        const easedProgress = easeOut(progress);
        slideProgressRef.current = -10 + easedProgress * 10;
        opacityProgressRef.current = easedProgress;
      } else {
        slideProgressRef.current = lerp(slideProgressRef.current, 0, 0.1);
        opacityProgressRef.current = lerp(opacityProgressRef.current, 1, 0.1);
      }

      boxContainerRef.current.position.x = slideProgressRef.current;

      const opacity = Math.max(0, Math.min(1, opacityProgressRef.current));
      const roundedOpacity = Math.round(opacity * 20) / 20;

      if (roundedOpacity !== lastOpacityRef.current) {
        lastOpacityRef.current = roundedOpacity;

        if (materialsRef.current.length === 0) {
          boxContainerRef.current.traverse((child) => {
            if (
              child instanceof THREE.Mesh ||
              child instanceof THREE.Line ||
              child instanceof THREE.Points
            ) {
              const material = child.material as THREE.Material & { opacity?: number };
              if (material && 'opacity' in material) {
                material.transparent = true;
                materialsRef.current.push(material);
              }
            }
          });
        }

        for (const material of materialsRef.current) {
          material.opacity = roundedOpacity;
        }
      }
    }
  });

  const easeInOutCubic = (t: number) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  const actionValue = easeInOutCubic(Math.min(actionProgress * 1.5, 1));
  const boxType = BOX_TYPES[currentType].type;
  const dimensions = BOX_DIMENSIONS[boxType];

  const renderBox = () => {
    switch (boxType) {
      case 'A':
        return <ATypeBox lidAngle={15 + actionValue * 75} />;
      case 'B':
        return <BTypeBox lidOffset={0.05 + actionValue * 0.9} />;
      case 'Y':
        return <YTypeBox lidAngle={actionValue * 80} />;
      case 'R':
        return <RTypeBox />;
      case 'G':
        return <GTypeBox lidAngle={15 + actionValue * 75} />;
      case 'M':
        return <MTypeBox />;
      case 'C':
        return <CTypeBox lidAngle={actionValue * 70} />;
      case 'S':
        return <STypeBox slideOffset={actionValue * 1.2 - 0.6} />;
      case 'BW':
        return <BWTypeBox lidAngle={15 + actionValue * 75} />;
      case 'CUSTOM':
        return <CustomTypeBox />;
      default:
        return <ATypeBox lidAngle={45} />;
    }
  };

  return (
    <group
      ref={groupRef}
      position={isMobile ? [0, 0.5, 0] : isLargeScreen ? [2.0, 0.5, 0] : [1.8, 0.5, 0]}
    >
      <group ref={boxContainerRef}>
        {renderBox()}
        <DimensionLines w={dimensions.w} h={dimensions.h} d={dimensions.d} />
      </group>
    </group>
  );
}

// 유기적으로 움직이는 파티클
function FloatingParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const mouse = useContext(MouseContext);
  const isMobile = useContext(MobileContext);

  // 모바일: 40개, 데스크톱: 100개
  const particleCount = isMobile ? 40 : 100;
  const frameSkip = useRef(0);

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
    frameSkip.current++;
    if (frameSkip.current % 2 !== 0) return;

    if (particlesRef.current) {
      const time = state.clock.elapsedTime;
      const positionAttribute = particlesRef.current.geometry.attributes.position;
      const posArray = positionAttribute.array as Float32Array;

      for (let i = 0; i < particleCount; i++) {
        const p = particleData[i];
        posArray[i * 3] =
          p.baseX + Math.sin(time * p.speedX + p.phaseX) * p.amplitudeX + mouse.x * 1.5;
        posArray[i * 3 + 1] =
          p.baseY + Math.sin(time * p.speedY + p.phaseY) * p.amplitudeY + mouse.y * 0.5;
        posArray[i * 3 + 2] = p.baseZ + Math.cos(time * p.speedZ + p.phaseZ) * p.amplitudeZ;
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

// 그리드 바닥
function CADGrid() {
  const gridRef = useRef<THREE.Group>(null);
  const mouse = useContext(MouseContext);
  const frameSkip = useRef(0);

  useFrame(() => {
    frameSkip.current++;
    if (frameSkip.current % 3 !== 0) return;

    if (gridRef.current) {
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
        fadeDistance={12}
        fadeStrength={1.5}
        followCamera={false}
        infiniteGrid={false}
      />
    </group>
  );
}

// 3D 바닥면
function Floor() {
  return (
    <group position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial color="#0a0a0a" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

// 3D 씬
function Scene({
  currentType,
  actionProgress,
  transitionPhase,
}: {
  currentType: number;
  actionProgress: number;
  transitionPhase: 'idle' | 'slideOut' | 'slideIn';
}) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      <MouseCamera />
      <Floor />
      <CADGrid />
      <FloatingParticles />
      <CADBox
        currentType={currentType}
        actionProgress={actionProgress}
        transitionPhase={transitionPhase}
      />
    </>
  );
}

// MobileContext는 위에서 선언됨 - export만 추가
export { MobileContext };

// 메인 Canvas 컴포넌트 (export)
interface HeroBoxCanvasProps {
  mousePosition: { x: number; y: number };
  currentType: number;
  actionProgress: number;
  transitionPhase: 'idle' | 'slideOut' | 'slideIn';
  isPaused?: boolean; // 화면에 보이지 않을 때 일시정지
  isMobile?: boolean; // 모바일 여부
  isLargeScreen?: boolean; // 큰 화면 여부 (xl: 1280px 이상)
}

export default function HeroBoxCanvas({
  mousePosition,
  currentType,
  actionProgress,
  transitionPhase,
  isPaused = false,
  isMobile = false,
  isLargeScreen = false,
}: HeroBoxCanvasProps) {
  // 화면 크기에 따른 카메라 설정
  const getCameraConfig = () => {
    if (isMobile) {
      return { position: [0, 5, 7] as [number, number, number], fov: 45 };
    }
    if (isLargeScreen) {
      // 큰 화면: 카메라를 더 가깝게, 박스가 더 중앙에 오도록
      return { position: [4, 3.5, 5] as [number, number, number], fov: 42 };
    }
    // 일반 데스크탑
    return { position: [6, 4, 6] as [number, number, number], fov: 50 };
  };

  const cameraConfig = getCameraConfig();

  return (
    <MouseContext.Provider value={mousePosition}>
      <MobileContext.Provider value={isMobile}>
        <LargeScreenContext.Provider value={isLargeScreen}>
          <Canvas
            camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            dpr={[1, 1.5]}
            performance={{ min: 0.5 }}
            frameloop={isPaused ? 'demand' : 'always'} // 일시정지 시 렌더링 중단
          >
            <Scene
              currentType={currentType}
              actionProgress={actionProgress}
              transitionPhase={transitionPhase}
            />
          </Canvas>
        </LargeScreenContext.Provider>
      </MobileContext.Provider>
    </MouseContext.Provider>
  );
}
