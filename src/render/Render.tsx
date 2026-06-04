import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import { FormObject } from '../form/schema';
import { SIDEBAR_PERCENT } from '../constants';

import { useWindowSize } from './useWindowSize';

import './render.css';

interface Props {
  style: React.CSSProperties | undefined;
  form: FormObject;
}

export const SceneRender = ({ style }: Props) => {
  const [width, height] = useWindowSize();
  const sectionRatio = (100 - SIDEBAR_PERCENT) / 100;

  return (
    <section className="render" style={style}>
      <Canvas
        style={{ width: width * sectionRatio, height }}
        camera={{ position: [400, -400, 400], fov: 50 }}
        gl={{ alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0, 0, 0, 0)}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <OrbitControls makeDefault />
      </Canvas>
    </section>
  );
};
