import type { MutableRefObject } from 'react';

export type Vector3Tuple = [number, number, number];

export type RotationTuple = [number, number, number];

export type ProgressRef = MutableRefObject<number>;

export interface DemoBoxProps {
  size?: Vector3Tuple;
  color?: string;
  rotationSpeed?: number;
  animate?: boolean;
  position?: Vector3Tuple;
}

export interface InteractivePanelProps {
  position?: Vector3Tuple;
  rotation?: RotationTuple;
  color?: string;
  selectedColor?: string;
}

export interface OptionalModelProps {
  enabled?: boolean;
  loader?: 'useGLTF' | 'useLoader';
  modelPath?: string;
  position?: Vector3Tuple;
  scale?: number;
}

export interface ProductBoxModelProps {
  progressRef: ProgressRef;
  animate?: boolean;
}

export interface HeroSceneProps {
  animate?: boolean;
  showOptionalModel?: boolean;
  foldProgressRef: ProgressRef;
}
