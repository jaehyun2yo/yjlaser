'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { ProgressRef } from '@/types/three-scene';

const LOOK_AT = new Vector3(0, 0.05, 0);
const DEFAULT_UP = new Vector3(0, 1, 0);

function easeInOut(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);

  return x * x * (3 - 2 * x);
}

interface HeroCameraRigProps {
  progressRef: ProgressRef;
  animate?: boolean;
}

export function HeroCameraRig({ progressRef, animate = true }: HeroCameraRigProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);
  const targetPosition = useMemo(() => new Vector3(), []);
  const lookAtTarget = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const compact = size.width < 860 || viewport.aspect < 1.2;
    const position = compact ? [3.25, 2.55, 5.45] : [4.35, 3.05, 5.8];

    camera.position.set(position[0], position[1], position[2]);
    camera.up.copy(DEFAULT_UP);
    camera.lookAt(LOOK_AT);

    if (camera instanceof PerspectiveCamera) {
      camera.fov = compact ? 48 : 41;
      camera.near = 0.1;
      camera.far = 80;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, viewport.aspect]);

  useFrame((_, delta) => {
    const compact = size.width < 860 || viewport.aspect < 1.2;
    const easedProgress = easeInOut(progressRef.current);
    const finalViewProgress = smoothstep(0.62, 1, easedProgress);
    const start = compact ? [3.25, 2.55, 5.45] : [4.35, 3.05, 5.8];
    const end = compact ? [0, 7.8, 2.35] : [0, 8.45, 2.18];
    const damp = 1 - Math.pow(0.0001, delta);

    targetPosition.set(
      start[0] + (end[0] - start[0]) * easedProgress,
      start[1] + (end[1] - start[1]) * easedProgress,
      start[2] + (end[2] - start[2]) * easedProgress
    );
    lookAtTarget.set(
      0,
      MathUtils.lerp(0.05, -0.42, finalViewProgress),
      MathUtils.lerp(0, 0.34, finalViewProgress)
    );

    if (animate) {
      camera.position.lerp(targetPosition, damp);
    } else {
      camera.position.copy(targetPosition);
    }

    camera.up.copy(DEFAULT_UP);

    if (camera instanceof PerspectiveCamera) {
      const targetFov = compact
        ? MathUtils.lerp(48, 51, finalViewProgress)
        : MathUtils.lerp(41, 45, finalViewProgress);

      if (Math.abs(camera.fov - targetFov) > 0.01) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
    }

    camera.lookAt(lookAtTarget);
  });

  return null;
}
