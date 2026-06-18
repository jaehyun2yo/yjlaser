'use client';

import { useMemo, useRef, useState } from 'react';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { Mesh, Vector3 } from 'three';
import type { InteractivePanelProps, RotationTuple, Vector3Tuple } from '@/types/three-scene';

const DEFAULT_POSITION: Vector3Tuple = [0.25, -1.05, 0.9];
const DEFAULT_ROTATION: RotationTuple = [-0.62, 0.08, 0];

export function InteractivePanel({
  position = DEFAULT_POSITION,
  rotation = DEFAULT_ROTATION,
  color = 'white',
  selectedColor = 'gold',
}: InteractivePanelProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState(false);
  const targetScale = useMemo(() => new Vector3(1, 1, 1), []);

  useFrame(() => {
    if (!meshRef.current) return;

    const scale = hovered ? 1.06 : 1;
    targetScale.set(scale, scale, scale);
    meshRef.current.scale.lerp(targetScale, 0.18);
  });

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(false);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    setSelected((current) => !current);
  };

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <boxGeometry args={[2.25, 0.04, 1.05]} />
      <meshStandardMaterial
        color={selected ? selectedColor : color}
        roughness={0.5}
        metalness={0.18}
        transparent
        opacity={selected ? 0.92 : 0.74}
      />
    </mesh>
  );
}
