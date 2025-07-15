import * as THREE from "three";
import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { ExpressionController } from "./expressionController";

/**
 * 感情表現としてExpressionとMotionを操作する為のクラス
 * デモにはExpressionのみが含まれています
 */
export class EmoteController {
  private _expressionController: ExpressionController;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._expressionController = new ExpressionController(vrm, camera);
  }

  public playEmotion(preset: VRMExpressionPresetName, weight: number = 1, duration: number = 2000) {
    console.log(`[EmoteController] playEmotion called:`, { preset, weight, duration });
    this._expressionController.playEmotion(preset, weight, duration);
  }
  
  public playComplexEmotion(emotions: Array<{name: VRMExpressionPresetName, weight: number}>, duration: number = 2000) {
    console.log(`[EmoteController] playComplexEmotion called:`, emotions, `duration: ${duration}ms`);
    this._expressionController.playComplexEmotion(emotions, duration);
  }

  public lipSync(preset: VRMExpressionPresetName, value: number) {
    this._expressionController.lipSync(preset, value);
  }

  public update(delta: number) {
    this._expressionController.update(delta);
  }
}
