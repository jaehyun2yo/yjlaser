'use client';

import { useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { OptionalModelProps } from '@/types/three-scene';

function OptionalModelWithUseGLTF({
  modelPath,
  position,
  scale,
}: Required<Pick<OptionalModelProps, 'modelPath' | 'position' | 'scale'>>) {
  const gltf = useGLTF(modelPath);

  return <primitive object={gltf.scene} position={position} scale={scale} />;
}

function OptionalModelWithUseLoader({
  modelPath,
  position,
  scale,
}: Required<Pick<OptionalModelProps, 'modelPath' | 'position' | 'scale'>>) {
  const gltf = useLoader(GLTFLoader, modelPath);

  return <primitive object={gltf.scene} position={position} scale={scale} />;
}

export function OptionalModel({
  enabled = false,
  loader = 'useGLTF',
  modelPath = '/models/demo.glb',
  position = [0, 0, 0],
  scale = 1,
}: OptionalModelProps) {
  if (!enabled) return null;

  if (loader === 'useLoader') {
    return <OptionalModelWithUseLoader modelPath={modelPath} position={position} scale={scale} />;
  }

  return <OptionalModelWithUseGLTF modelPath={modelPath} position={position} scale={scale} />;
}
