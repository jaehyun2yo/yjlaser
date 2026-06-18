export function HeroLights() {
  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#fff3df', '#8b623d', 0.72]} />
      <directionalLight
        castShadow
        position={[3.8, 7.2, 4.6]}
        intensity={2.1}
        shadow-bias={-0.00018}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={18}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />
      <directionalLight position={[-5, 4, -3.5]} intensity={0.95} color="#f7d6aa" />
      <pointLight position={[0, 2.4, 4.8]} intensity={0.56} color="#fff7ec" />
    </>
  );
}
