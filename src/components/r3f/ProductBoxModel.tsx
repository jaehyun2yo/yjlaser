'use client';

import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  LoopOnce,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type AnimationAction,
  type AnimationClip,
  type Group,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { ProductBoxModelProps } from '@/types/three-scene';

const PRODUCT_BOX_MODEL_PATH = '/models/c-type-box.glb';
const CARDBOARD_COLOR = '#b47b43';
const CARDBOARD_TINT = '#fff1dd';
const DARK_PRINT_COLOR = '#3c2a1b';
const EDGE_COLOR = '#c29565';
const START_ROTATION_Y = -0.24;
const FULL_ROTATION_Y = Math.PI * 2;
const OPEN_CLIP_PROGRESS = 0.94;

interface ProductBoxGltf {
  scene: Group;
  animations: AnimationClip[];
}

interface BoxTextures {
  cardboard: Texture;
  bump: Texture;
}

function easeInOut(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);

  return x * x * (3 - 2 * x);
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function createCardboardTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext('2d');
  if (!context) return new CanvasTexture(canvas);

  context.fillStyle = CARDBOARD_COLOR;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 1450; i += 1) {
    const shade = 42 + Math.floor(Math.random() * 46);
    const alpha = 0.035 + Math.random() * 0.08;
    const y = Math.random() * canvas.height;
    const x = Math.random() * canvas.width;
    const length = 16 + Math.random() * 74;

    context.strokeStyle = `rgba(${shade}, ${Math.max(24, shade - 12)}, ${Math.max(
      10,
      shade - 24
    )}, ${alpha})`;
    context.lineWidth = Math.random() < 0.82 ? 1 : 2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(Math.min(canvas.width, x + length), y + (Math.random() - 0.5) * 3);
    context.stroke();
  }

  for (let y = 0; y < canvas.height; y += 9) {
    context.fillStyle = `rgba(255, 236, 204, ${y % 27 === 0 ? 0.025 : 0.012})`;
    context.fillRect(0, y, canvas.width, 1);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2.4, 2.4);
  texture.needsUpdate = true;

  return texture;
}

function createBumpTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext('2d');
  if (!context) return new CanvasTexture(canvas);

  context.fillStyle = '#808080';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 2) {
    const value = 106 + Math.floor(Math.random() * 42);
    context.fillStyle = `rgb(${value}, ${value}, ${value})`;
    context.fillRect(0, y, canvas.width, 1);
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;

  return texture;
}

function tintBoxMaterial(material: Material, textures: BoxTextures): Material {
  const clonedMaterial = material.clone();

  if (clonedMaterial instanceof MeshStandardMaterial) {
    const name = clonedMaterial.name.toLowerCase();

    if (name.includes('edge') || name.includes('corrugated')) {
      clonedMaterial.color.set(EDGE_COLOR);
      clonedMaterial.map = textures.cardboard;
      clonedMaterial.bumpMap = textures.bump;
      clonedMaterial.bumpScale = 0.018;
    } else if (
      name.includes('line') ||
      name.includes('slot') ||
      name.includes('print') ||
      name.includes('dieline')
    ) {
      clonedMaterial.color.set(DARK_PRINT_COLOR);
      clonedMaterial.map = null;
      clonedMaterial.bumpMap = null;
    } else {
      clonedMaterial.color.set(CARDBOARD_TINT);
      clonedMaterial.map = textures.cardboard;
      clonedMaterial.bumpMap = textures.bump;
      clonedMaterial.bumpScale = 0.012;
    }

    clonedMaterial.metalness = 0;
    clonedMaterial.roughness = 0.94;
    clonedMaterial.needsUpdate = true;
  }

  return clonedMaterial;
}

export function ProductBoxModel({ progressRef, animate = true }: ProductBoxModelProps) {
  const rootRef = useRef<Group>(null);
  const currentProgressRef = useRef(progressRef.current);
  const gltf = useGLTF(PRODUCT_BOX_MODEL_PATH) as ProductBoxGltf;
  const textures = useMemo(
    () => ({
      cardboard: createCardboardTexture(),
      bump: createBumpTexture(),
    }),
    []
  );
  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);

    clonedScene.traverse((object) => {
      if (!isMesh(object)) return;

      object.castShadow = true;
      object.receiveShadow = true;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => tintBoxMaterial(material, textures))
        : tintBoxMaterial(object.material, textures);
    });

    return clonedScene;
  }, [gltf.scene, textures]);
  const duration = useMemo(
    () => gltf.animations.reduce((max, clip) => Math.max(max, clip.duration), 0),
    [gltf.animations]
  );
  const { actions, mixer } = useAnimations(gltf.animations, rootRef);

  useEffect(() => {
    return () => {
      textures.cardboard.dispose();
      textures.bump.dispose();
    };
  }, [textures]);

  useEffect(() => {
    const activeActions = Object.values(actions).filter((action): action is AnimationAction =>
      Boolean(action)
    );

    activeActions.forEach((action) => {
      action.reset();
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      action.play();
    });

    return () => {
      activeActions.forEach((action) => action.stop());
    };
  }, [actions]);

  useFrame((_, delta) => {
    const targetProgress = progressRef.current;
    const damp = 1 - Math.pow(0.00004, delta);
    currentProgressRef.current = animate
      ? MathUtils.lerp(currentProgressRef.current, targetProgress, damp)
      : targetProgress;

    const easedProgress = easeInOut(currentProgressRef.current);
    const straightenProgress = smoothstep(0.74, 1, easedProgress);
    const rotationProgress = animate ? easedProgress : currentProgressRef.current;

    if (duration > 0) {
      mixer.setTime(easedProgress * duration * OPEN_CLIP_PROGRESS);
    }

    if (rootRef.current) {
      rootRef.current.position.y = MathUtils.lerp(-0.58, -0.75, easedProgress);
      rootRef.current.rotation.y =
        START_ROTATION_Y +
        FULL_ROTATION_Y * rotationProgress -
        START_ROTATION_Y * straightenProgress;
      rootRef.current.scale.setScalar(
        MathUtils.lerp(9.4, 7.35, smoothstep(0.52, 1, easedProgress))
      );
    }
  });

  return (
    <group ref={rootRef} position={[0, -0.58, 0]} rotation={[0, START_ROTATION_Y, 0]} scale={9.4}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(PRODUCT_BOX_MODEL_PATH);
