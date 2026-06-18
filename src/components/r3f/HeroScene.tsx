'use client';

import { ContactShadows } from '@react-three/drei';
import { HeroCameraRig } from '@/components/r3f/HeroCameraRig';
import { HeroLights } from '@/components/r3f/HeroLights';
import { ProductBoxModel } from '@/components/r3f/ProductBoxModel';
import type { HeroSceneProps } from '@/types/three-scene';

export function HeroScene({ animate = true, foldProgressRef }: HeroSceneProps) {
  return (
    <>
      <HeroCameraRig progressRef={foldProgressRef} animate={animate} />
      <HeroLights />
      <group position={[0, 0, 0]}>
        <ProductBoxModel progressRef={foldProgressRef} animate={animate} />
      </group>
      <ContactShadows
        position={[0, -0.84, 0]}
        opacity={0.34}
        scale={12}
        blur={2.4}
        far={2.6}
        resolution={512}
        color="#4a2e1d"
      />
    </>
  );
}
