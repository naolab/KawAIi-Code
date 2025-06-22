import * as THREE from "three";
// import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"; // 未使用のため削除
// import { VRMAnimationLoaderPluginOptions } from "./VRMAnimationLoaderPluginOptions"; // 未使用のため削除
import { VRMCVRMAnimation } from "./VRMCVRMAnimation";
import { VRMHumanBoneName, VRMHumanBoneParentMap } from "@pixiv/three-vrm";
import { VRMAnimation } from "./VRMAnimation";
import { arrayChunk } from "./utils/arrayChunk";

const MAT4_IDENTITY = new THREE.Matrix4();

const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _quatC = new THREE.Quaternion();

interface VRMAnimationLoaderPluginNodeMap {
  humanoidIndexToName: Map<number, VRMHumanBoneName>;
  expressionsIndexToName: Map<number, string>;
  lookAtIndex: number | null;
}

type VRMAnimationLoaderPluginWorldMatrixMap = Map<
  VRMHumanBoneName | "hipsParent",
  THREE.Matrix4
>;

export class VRMAnimationLoaderPlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly parser: any;

  public constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser: any,
  ) {
    this.parser = parser;
  }

  public get name(): string {
    return "VRMC_vrm_animation";
  }

  public async afterRoot(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gltf: any
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defGltf = gltf.parser.json as any;
    const defExtensionsUsed = defGltf.extensionsUsed as string[] | undefined;

    if (
      defExtensionsUsed == null ||
      defExtensionsUsed.indexOf(this.name) == -1
    ) {
      return;
    }

    const defExtension = defGltf.extensions?.[this.name] as
      | VRMCVRMAnimation
      | undefined;

    if (defExtension == null) {
      return;
    }

    const nodeMap = this._createNodeMap(defExtension);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worldMatrixMap = await this._createBoneWorldMatrixMap(
      gltf,
      defExtension
    );

    const hipsNode = defExtension.humanoid.humanBones["hips"]!.node;
    const hips = (await gltf.parser.getDependency(
      "node",
      hipsNode
    )) as THREE.Object3D;
    const restHipsPosition = hips.getWorldPosition(new THREE.Vector3());

    const clips = gltf.animations as THREE.AnimationClip[];
    const animations: VRMAnimation[] = clips.map((
      clip: THREE.AnimationClip,
      iAnimation: number
    ) => {
      const defAnimation = (defGltf.animations as Record<string, unknown>[])[iAnimation];

      const animation = this._parseAnimation(
        clip,
        defAnimation,
        nodeMap,
        worldMatrixMap
      );
      animation.restHipsPosition = restHipsPosition;

      return animation;
    });

    (gltf.userData as Record<string, unknown>).vrmAnimations = animations;
  }

  private _createNodeMap(
    defExtension: VRMCVRMAnimation
  ): VRMAnimationLoaderPluginNodeMap {
    const humanoidIndexToName: Map<number, VRMHumanBoneName> = new Map();
    const expressionsIndexToName: Map<number, string> = new Map();
    const lookAtIndex: number | null = defExtension.lookAt?.node ?? null;

    // humanoid
    const humanBones = defExtension.humanoid?.humanBones;

    if (humanBones) {
      Object.entries(humanBones).forEach(([name, bone]) => {
        const { node } = bone;
        humanoidIndexToName.set(node, name as VRMHumanBoneName);
      });
    }

    // expressions
    const preset = defExtension.expressions?.preset;

    if (preset) {
      Object.entries(preset).forEach(([name, expression]) => {
        const { node } = expression;
        expressionsIndexToName.set(node, name as string);
      });
    }

    const custom = defExtension.expressions?.custom;

    if (custom) {
      Object.entries(custom).forEach(([name, expression]) => {
        const { node } = expression;
        expressionsIndexToName.set(node, name as string);
      });
    }

    return { humanoidIndexToName, expressionsIndexToName, lookAtIndex };
  }

  private async _createBoneWorldMatrixMap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gltf: any,
    defExtension: VRMCVRMAnimation
  ): Promise<VRMAnimationLoaderPluginWorldMatrixMap> {
    // update the entire hierarchy first
    (gltf.scene as THREE.Scene).updateWorldMatrix(false, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threeNodes = await (gltf.parser as any).getDependencies("node") as THREE.Object3D[];

    const worldMatrixMap: VRMAnimationLoaderPluginWorldMatrixMap = new Map();

    for (const [boneName, { node }] of Object.entries(
      defExtension.humanoid.humanBones
    )) {
      const threeNode = threeNodes[node];
      worldMatrixMap.set(boneName as VRMHumanBoneName, threeNode.matrixWorld);

      if (boneName === "hips") {
        worldMatrixMap.set(
          "hipsParent",
          threeNode.parent?.matrixWorld ?? MAT4_IDENTITY
        );
      }
    }

    return worldMatrixMap;
  }

  private _parseAnimation(
    animationClip: THREE.AnimationClip,
    defAnimation: Record<string, unknown>,
    nodeMap: VRMAnimationLoaderPluginNodeMap,
    worldMatrixMap: VRMAnimationLoaderPluginWorldMatrixMap
  ): VRMAnimation {
    const tracks = animationClip.tracks;
    const defChannels = (defAnimation.channels as Record<string, unknown>[]);

    const result = new VRMAnimation();

    result.duration = animationClip.duration;

    defChannels.forEach((
      channel: Record<string, unknown>,
      iChannel: number
    ) => {
      const target = (channel as Record<string, unknown>).target as Record<string, number>;
      const node = target.node;
      const origTrack = tracks[iChannel];

      if (node == null) {
        return;
      }

      // humanoid
      const boneName = nodeMap.humanoidIndexToName.get(node);
      if (boneName != null) {
        let parentBoneName: VRMHumanBoneName | "hipsParent" | null =
          VRMHumanBoneParentMap[boneName];
        while (
          parentBoneName != null &&
          worldMatrixMap.get(parentBoneName) == null
        ) {
          parentBoneName = VRMHumanBoneParentMap[parentBoneName];
        }
        parentBoneName ??= "hipsParent";

        const track = origTrack.clone();
        track.name = `${boneName}.quaternion`;

        const convertedKeyframes = arrayChunk(track.values, 4).map(
          (c: number[], i: number) => {
            const time = track.times[i];
            const origQuat = _quatA.fromArray(c, 0);

            // calc world matrix of source node when rest pose
            const sourceMat = worldMatrixMap.get(boneName)!;
            const parentSourceMat = worldMatrixMap.get(parentBoneName)!;

            // calc world matrix of target node when rest pose
            // this is basically the inverse of parentSourceMat * sourceMat
            const targetMat = _quatC
              .setFromRotationMatrix(parentSourceMat)
              .invert()
              .multiply(
                _quatB.setFromRotationMatrix(sourceMat).multiply(origQuat)
              )
              .normalize();

            return [time, targetMat.x, targetMat.y, targetMat.z, targetMat.w];
          }
        );

        result.humanoidTracks.rotation.set(boneName, new THREE.QuaternionKeyframeTrack(
          track.name,
          convertedKeyframes.flatMap((f) => f[0] as number),
          convertedKeyframes.flatMap((f) => f.slice(1) as number[]),
        ));
      }

      // expressions
      const expressionName = nodeMap.expressionsIndexToName.get(node);
      if (expressionName != null) {
        const track = origTrack.clone();
        track.name = `expressions.${expressionName}`;

        result.expressionTracks.set(expressionName, track as THREE.NumberKeyframeTrack);
      }

      // lookAt
      if (node === nodeMap.lookAtIndex) {
        // this is just an identity transform for the sake of VRM spec
        const track = origTrack.clone();
        track.name = `lookAt.rotation`;

        result.lookAtTrack = track as THREE.QuaternionKeyframeTrack;
      }
    });

    return result;
  }
}
