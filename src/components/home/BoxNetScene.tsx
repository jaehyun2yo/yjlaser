'use client';

import { useRef, useMemo, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// DXF에서 추출한 좌표 (Y축 반전 및 중앙 정렬)
const OFFSET_X = 134;
const OFFSET_Y = -167;
const SCALE = 0.018;

// 좌표 변환 함수
function t(x: number, y: number): [number, number, number] {
  return [(x - OFFSET_X) * SCALE, (y - OFFSET_Y) * SCALE, 0];
}

// 선 색상
const COLORS = {
  main: '#ED6C00',
  bg: '#0a0a0a',
};

// 좌표 보간 함수
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// 정적 라인 데이터 (morphProgress에 영향받지 않음)
const STATIC_LINES: [number, number, number][][] = [
  [t(191.99997375, -221.49995677), t(187.46406297, -227.49996587)],
  [t(160.19995021, -241.99997905), t(160.19995021, -239.99997601)],
  [t(166.69995125, -241.99997905), t(166.69995125, -247.99998815)],
  [t(157.69995524, -256.99998416), t(151.1999542, -256.99998416)],
  [t(142.19995818, -247.99998815), t(142.19995818, -241.99997905)],
  [t(148.69995922, -239.99997601), t(148.69995922, -241.99997905)],
  [t(121.43588174, -227.49996587), t(116.90000623, -221.49995677)],
  [t(90.69997707, -216.49996682), t(76.09998668, -212.58790825)],
  [t(191.99997375, -97.49998033), t(187.46406297, -91.49997123)],
  [t(167.19994319, -76.99999333), t(166.86081791, -70.5290259)],
  [t(142.03909152, -70.5290259), t(141.69996624, -76.99999333)],
  [t(121.43588174, -91.49997123), t(116.90000623, -97.49998033)],
  [t(90.69997707, -102.49997028), t(76.09998668, -106.41202885)],
  [t(116.90000623, -216.49996682), t(90.69997707, -216.49996682)],
  [t(157.87316912, -62.00005877), t(151.02674031, -62.00005877)],
  [t(116.90000623, -102.49997028), t(90.69997707, -102.49997028)],
  [t(76.09998668, -106.41202885), t(76.09998668, -212.58790825)],
  [t(167.19994319, -76.99999333), t(167.19994319, -100.99999446)],
  [t(167.19994319, -217.99997792), t(167.19994319, -241.99997905)],
  [t(167.19994319, -241.99997905), t(160.19995021, -241.99997905)],
  [t(148.69995922, -241.99997905), t(141.69996624, -241.99997905)],
  [t(141.69996624, -241.99997905), t(141.69996624, -217.99997792)],
  [t(141.69996624, -100.99999446), t(141.69996624, -76.99999333)],
  [t(116.90000623, -221.49995677), t(116.90000623, -216.49996682)],
  [t(116.90000623, -102.49997028), t(116.90000623, -97.49998033)],
  [t(166.59997403, -216.99995876), t(142.29997068, -216.99995876)],
  [t(159.59994577, -240.99995989), t(149.29996366, -240.99995989)],
  [t(191.99997375, -221.49995677), t(191.99997375, -97.49998033)],
  [t(167.19994319, -101.59996362), t(167.19994319, -217.39997348)],
  [t(141.69996624, -101.59996362), t(141.69996624, -217.39997348)],
  [t(116.1999893, -103.09997472), t(116.1999893, -215.89996238)],
  [t(90.69997707, -103.09997472), t(90.69997707, -215.89996238)],
  [t(166.59997403, -101.99997834), t(142.29997068, -101.99997834)],
  [t(166.59997403, -76.99999333), t(142.29997068, -76.99999333)],
  [t(191.39996932, -216.49996682), t(169.29995872, -216.49996682)],
  [t(139.59995071, -216.49996682), t(117.49997539, -216.49996682)],
  [t(191.39996932, -102.49997028), t(169.29995872, -102.49997028)],
  [t(139.59995071, -102.49997028), t(117.49997539, -102.49997028)],
  [t(166.36410681, -72.5000306), t(160.06413077, -72.5000306)],
  [t(148.83577867, -72.5000306), t(142.53580262, -72.5000306)],
];

// Arc 데이터
const ARC_DATA = [
  { cx: 168.69996991, cy: -217.99996057, r: 1.49998699, start: 2.9868021, end: 92.9880633 },
  { cx: 168.69997744, cy: -218.0000075, r: 1.50003425, start: 92.98825713, end: 179.99887006 },
  { cx: 140.19997859, cy: -217.99995447, r: 1.49998765, start: 359.99910441, end: 89.99954807 },
  { cx: 140.20001394, cy: -218.00003185, r: 1.50006503, start: 90.00089817, end: 177.01062715 },
  { cx: 168.69998353, cy: -100.99992993, r: 1.50004034, start: 180.00246471, end: 270.00023029 },
  { cx: 168.69996181, cy: -100.99997319, r: 1.49999709, start: 270.00105987, end: 357.01174078 },
  { cx: 140.19995876, cy: -100.99995518, r: 1.50000915, start: 182.98892399, end: 272.98863276 },
  { cx: 140.19999577, cy: -100.99999198, r: 1.49997047, start: 272.98729402, end: 359.99990533 },
  { cx: 157.69996514, cy: -247.99999805, r: 8.99998611, start: 269.99993697, end: 360.00006303 },
  { cx: 151.19998946, cy: -247.99995288, r: 9.00003128, start: 180.00022452, end: 269.99977548 },
  { cx: 157.87318155, cy: -71.00002826, r: 8.99996948, start: 2.99987469, end: 90.00007909 },
  { cx: 151.02677354, cy: -71.00007636, r: 9.00001759, start: 90.00021153, end: 176.99983469 },
];

// 애니메이션 라인 정의
const ANIMATED_LINE_DEFS = [
  {
    x1: 170.69784065,
    y1: -227.49996587,
    x2: 172.2164375,
    y2: -227.49996587,
    staticEnd: t(170.19791927, -217.92180236),
    isStartAnimated: true,
  },
  {
    staticStart: t(138.70199016, -217.92180236),
    x1: 138.20206878,
    y1: -227.49996587,
    x2: 136.686158,
    y2: -227.49996587,
    isStartAnimated: false,
  },
  {
    x1: 170.69784065,
    y1: -91.49997123,
    x2: 172.2164375,
    y2: -91.49997123,
    staticEnd: t(170.19791927, -101.07817002),
    isStartAnimated: true,
  },
  {
    staticStart: t(138.70199016, -101.07817002),
    x1: 138.20206878,
    y1: -91.49997123,
    x2: 136.686158,
    y2: -91.49997123,
    isStartAnimated: false,
  },
  {
    staticStart: t(187.46406297, -227.49996587),
    x1: 170.69784065,
    y1: -227.49996587,
    x2: 172.2164375,
    y2: -227.49996587,
    isStartAnimated: false,
  },
  {
    x1: 138.20206878,
    y1: -227.49996587,
    x2: 136.686158,
    y2: -227.49996587,
    staticEnd: t(121.43588174, -227.49996587),
    isStartAnimated: true,
  },
  {
    staticStart: t(187.46406297, -91.49997123),
    x1: 170.69784065,
    y1: -91.49997123,
    x2: 172.2164375,
    y2: -91.49997123,
    isStartAnimated: false,
  },
  {
    x1: 138.20206878,
    y1: -91.49997123,
    x2: 136.686158,
    y2: -91.49997123,
    staticEnd: t(121.43588174, -91.49997123),
    isStartAnimated: true,
  },
];

// 전역 Material (재사용으로 GPU 오버헤드 감소)
const mainMaterial = new THREE.LineBasicMaterial({
  color: COLORS.main,
  transparent: true,
  opacity: 0,
});

const gridMajorMaterial = new THREE.LineBasicMaterial({
  color: '#3a3a3a',
  transparent: true,
  opacity: 0.6,
});

const gridMinorMaterial = new THREE.LineBasicMaterial({
  color: '#1f1f1f',
  transparent: true,
  opacity: 0.3,
});

// 통합 BufferGeometry 기반 BoxNet
function BoxNet({ scrollProgressRef }: { scrollProgressRef: MutableRefObject<number> }) {
  const animatedGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const lastMorphRef = useRef(-1);
  const lastFadeRef = useRef(-1);

  // 정적 라인 geometry
  const staticGeometry = useMemo(() => {
    const positions: number[] = [];
    STATIC_LINES.forEach((line) => {
      positions.push(...line[0], ...line[1]);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  // Arc geometry
  const arcGeometry = useMemo(() => {
    const positions: number[] = [];
    const segments = 24;

    ARC_DATA.forEach((arc) => {
      const startRad = (arc.start * Math.PI) / 180;
      let endRad = (arc.end * Math.PI) / 180;
      if (endRad < startRad) endRad += Math.PI * 2;

      for (let i = 0; i < segments; i++) {
        const angle1 = startRad + (endRad - startRad) * (i / segments);
        const angle2 = startRad + (endRad - startRad) * ((i + 1) / segments);

        const p1 = t(arc.cx + arc.r * Math.cos(angle1), arc.cy + arc.r * Math.sin(angle1));
        const p2 = t(arc.cx + arc.r * Math.cos(angle2), arc.cy + arc.r * Math.sin(angle2));

        positions.push(...p1, ...p2);
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  // 애니메이션 라인 geometry
  const animatedGeometry = useMemo(() => {
    const positions: number[] = [];

    ANIMATED_LINE_DEFS.forEach((def) => {
      const animatedPoint = t(def.x1, def.y1);

      if (def.isStartAnimated) {
        positions.push(...animatedPoint, ...(def.staticEnd as [number, number, number]));
      } else {
        positions.push(...(def.staticStart as [number, number, number]), ...animatedPoint);
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame(() => {
    const scrollProgress = scrollProgressRef.current;
    const fadeInProgress = Math.min(scrollProgress * 10, 1);
    const morphProgress = scrollProgress > 0.33 ? Math.min((scrollProgress - 0.33) * 3, 1) : 0;

    // fadeInProgress 업데이트
    if (Math.abs(fadeInProgress - lastFadeRef.current) > 0.01) {
      lastFadeRef.current = fadeInProgress;
      mainMaterial.opacity = fadeInProgress;
    }

    // morphProgress 업데이트
    if (Math.abs(morphProgress - lastMorphRef.current) > 0.005) {
      lastMorphRef.current = morphProgress;

      if (animatedGeometryRef.current) {
        const positions = animatedGeometryRef.current.attributes.position.array as Float32Array;
        let idx = 0;

        ANIMATED_LINE_DEFS.forEach((def) => {
          const animatedX = lerp(def.x1, def.x2, morphProgress);
          const animatedPoint = t(animatedX, def.y1);

          if (def.isStartAnimated) {
            positions[idx++] = animatedPoint[0];
            positions[idx++] = animatedPoint[1];
            positions[idx++] = animatedPoint[2];
            idx += 3;
          } else {
            idx += 3;
            positions[idx++] = animatedPoint[0];
            positions[idx++] = animatedPoint[1];
            positions[idx++] = animatedPoint[2];
          }
        });

        animatedGeometryRef.current.attributes.position.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <lineSegments geometry={staticGeometry} material={mainMaterial} />
      <lineSegments
        ref={(ref) => {
          if (ref) animatedGeometryRef.current = ref.geometry;
        }}
        geometry={animatedGeometry}
        material={mainMaterial}
      />
      <lineSegments geometry={arcGeometry} material={mainMaterial} />
    </group>
  );
}

// CAD 그리드 (전역 material 재사용) - 화면 전체에 표시
function CADGrid() {
  const { majorGeometry, minorGeometry } = useMemo(() => {
    const size = 100; // 전체 화면에 보이도록 크기 증가
    const majorDivisions = 50;
    const minorDivisions = 100;
    const minorStep = size / minorDivisions;

    const majorPoints: number[] = [];
    const minorPoints: number[] = [];

    for (let i = -minorDivisions / 2; i <= minorDivisions / 2; i++) {
      const pos = i * minorStep;
      const isMajor = i % (minorDivisions / majorDivisions) === 0;
      const arr = isMajor ? majorPoints : minorPoints;

      arr.push(-size / 2, pos, -0.1, size / 2, pos, -0.1);
      arr.push(pos, -size / 2, -0.1, pos, size / 2, -0.1);
    }

    const majorGeo = new THREE.BufferGeometry();
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPoints, 3));

    const minorGeo = new THREE.BufferGeometry();
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPoints, 3));

    return { majorGeometry: majorGeo, minorGeometry: minorGeo };
  }, []);

  return (
    <group>
      <lineSegments geometry={majorGeometry} material={gridMajorMaterial} />
      <lineSegments geometry={minorGeometry} material={gridMinorMaterial} />
    </group>
  );
}

// 카메라 컨트롤러 (부드러운 보간 적용)
function CameraController({ scrollProgressRef }: { scrollProgressRef: MutableRefObject<number> }) {
  const { camera } = useThree();
  // 현재 카메라 위치 (부드러운 보간용)
  const currentPosRef = useRef({ x: 0, y: 0, z: 25 });
  // 목표 카메라 위치
  const targetPosRef = useRef({ x: 0, y: 0, z: 25 });

  useFrame((_, delta) => {
    const scrollProgress = scrollProgressRef.current;
    const zoomProgress = scrollProgress > 0.1 ? Math.min((scrollProgress - 0.1) / 0.23, 1) : 0;
    const exitProgress = scrollProgress > 0.66 ? (scrollProgress - 0.66) * 3 : 0;

    const startZ = 25;
    const endZ = 2.0;
    const phase1TargetX = 0.65;
    const phase1TargetY = 1.35;
    const phase2TargetX = 0.08;
    const phase2TargetY = -1.1;

    let targetX: number;
    let targetY: number;
    let targetZ: number;

    if (exitProgress > 0) {
      const exitEased =
        exitProgress < 0.5
          ? 2 * exitProgress * exitProgress
          : 1 - Math.pow(-2 * exitProgress + 2, 2) / 2;

      targetX = lerp(phase1TargetX, phase2TargetX, exitEased);
      targetY = lerp(phase1TargetY, phase2TargetY, exitEased);
      targetZ = endZ;
    } else {
      const eased =
        zoomProgress < 0.5
          ? 4 * zoomProgress * zoomProgress * zoomProgress
          : 1 - Math.pow(-2 * zoomProgress + 2, 3) / 2;

      targetX = eased * phase1TargetX;
      targetY = eased * phase1TargetY;
      targetZ = startZ - eased * (startZ - endZ);
    }

    // 목표 위치 업데이트
    targetPosRef.current = { x: targetX, y: targetY, z: targetZ };

    // 부드러운 보간 (damping factor: 값이 작을수록 더 부드러움)
    // delta를 사용해 프레임률 독립적으로 만듦
    const smoothFactor = 1 - Math.pow(0.001, delta); // 약 8-12 범위의 부드러움

    currentPosRef.current.x = lerp(currentPosRef.current.x, targetPosRef.current.x, smoothFactor);
    currentPosRef.current.y = lerp(currentPosRef.current.y, targetPosRef.current.y, smoothFactor);
    currentPosRef.current.z = lerp(currentPosRef.current.z, targetPosRef.current.z, smoothFactor);

    // 카메라 위치 적용
    const { x, y, z } = currentPosRef.current;
    camera.position.set(x, y, z);
    camera.lookAt(x, y, 0);
  });

  return null;
}

// Scene 컴포넌트
function Scene({ scrollProgressRef }: { scrollProgressRef: MutableRefObject<number> }) {
  return (
    <>
      <color attach="background" args={[COLORS.bg]} />
      <CameraController scrollProgressRef={scrollProgressRef} />
      <CADGrid />
      <BoxNet scrollProgressRef={scrollProgressRef} />
    </>
  );
}

// Canvas 컴포넌트
interface BoxNetCanvasProps {
  scrollProgressRef: MutableRefObject<number>;
  isPaused: boolean;
}

export default function BoxNetCanvas({ scrollProgressRef, isPaused }: BoxNetCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 25], fov: 40 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      dpr={[1, 2]} // 성능에 따라 DPR 자동 조절
      frameloop={isPaused ? 'demand' : 'always'}
      performance={{ min: 0.5 }} // 성능 저하 시 품질 자동 조절
    >
      <Scene scrollProgressRef={scrollProgressRef} />
    </Canvas>
  );
}
