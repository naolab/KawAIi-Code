import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMAnimation } from './VRMAnimation';
import { VRMAnimationLoaderPlugin } from './VRMAnimationLoaderPlugin';

const loader = new GLTFLoader();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
loader.register((parser: any) => new VRMAnimationLoaderPlugin(parser));

export async function loadVRMAnimation(url: string): Promise<VRMAnimation | null> {
  console.log('🎭 Loading VRMAnimation from:', url);
  
  try {
    const gltf = await loader.loadAsync(url);
    console.log('🎭 GLTF loaded:', gltf);
    console.log('🎭 GLTF userData:', gltf.userData);

    const vrmAnimations: VRMAnimation[] = gltf.userData.vrmAnimations;
    console.log('🎭 VRM animations found:', vrmAnimations?.length || 0);
    
    const vrmAnimation: VRMAnimation | undefined = vrmAnimations?.[0];
    console.log('🎭 Selected VRM animation:', vrmAnimation);
    
    if (vrmAnimation) {
      console.log('🎭 Animation duration:', vrmAnimation.duration);
      console.log('🎭 Animation humanoid tracks:', vrmAnimation.humanoidTracks);
    }

    return vrmAnimation ?? null;
  } catch (error) {
    console.error('🎭 Error loading VRM animation:', error);
    return null;
  }
}
