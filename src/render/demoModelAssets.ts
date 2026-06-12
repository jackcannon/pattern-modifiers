import { DemoModelType } from '../form/schema';

export type ObjDemoModelType = Extract<DemoModelType, 'suzanne' | 'bunny'>;
export type StlDemoModelType = Extract<DemoModelType, 'benchy'>;

export const DEMO_OBJ_PATHS: Record<ObjDemoModelType, string> = {
  suzanne: '/models/suzanne.obj',
  bunny: '/models/stanford-bunny.obj'
};

export const DEMO_STL_PATHS: Record<StlDemoModelType, string> = {
  benchy: '/models/benchy.stl'
};

export const isObjDemoModel = (model: DemoModelType): model is ObjDemoModelType => model in DEMO_OBJ_PATHS;

export const isStlDemoModel = (model: DemoModelType): model is StlDemoModelType => model in DEMO_STL_PATHS;
