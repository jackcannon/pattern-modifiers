interface Props {
  width: number;
  depth: number;
  margin?: number;
  thickness?: number;
}

export const BuildPlate = ({ width, depth, margin = 5, thickness = 1 }: Props) => {
  const plateWidth = width + margin * 2;
  const plateDepth = depth + margin * 2;

  return (
    <mesh position={[0, 0, -thickness / 2]} renderOrder={0}>
      <boxGeometry args={[plateWidth, plateDepth, thickness]} />
      <meshStandardMaterial
        color="#3d3d37"
        metalness={0.35}
        roughness={0.65}
        transparent
        opacity={0.92}
        depthWrite={false}
      />
    </mesh>
  );
};
