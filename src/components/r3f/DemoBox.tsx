'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { DemoBoxProps, Vector3Tuple } from '@/types/three-scene';

const DEFAULT_SIZE: Vector3Tuple = [1.8, 1.25, 1.2];
const DEFAULT_POSITION: Vector3Tuple = [0, 0.15, 0];

export function DemoBox({
  size = DEFAULT_SIZE,
  color = 'orange',
  rotationSpeed = 0.35,
  animate = true,
  position = DEFAULT_POSITION,
}: DemoBoxProps) {
  const meshRef = useRef<Mesh>(null);
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animate && !prefersReducedMotion;

  useFrame((_, delta) => {
    if (!meshRef.current || !shouldAnimate) return;

    meshRef.current.rotation.y += delta * rotationSpeed;
    meshRef.current.rotation.x = Math.sin(meshRef.current.rotation.y * 0.7) * 0.08;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[0.15, -0.35, 0]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.58} metalness={0.08} />
    </mesh>
  );
}
