import * as THREE from "three";
import {
  VRM,
  VRMExpressionManager,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { AutoLookAt } from "./autoLookAt";
import { AutoBlink } from "./autoBlink";

/**
 * Expressionを管理するクラス
 *
 * 主に前の表情を保持しておいて次の表情を適用する際に0に戻す作業や、
 * 前の表情が終わるまで待ってから表情適用する役割を持っている。
 */
export class ExpressionController {
  private _autoLookAt: AutoLookAt;
  private _autoBlink?: AutoBlink;
  private _expressionManager?: VRMExpressionManager;
  private _currentEmotion: VRMExpressionPresetName;
  private _currentLipSync: {
    preset: VRMExpressionPresetName;
    value: number;
  } | null;
  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._autoLookAt = new AutoLookAt(vrm, camera);
    this._currentEmotion = "neutral";
    this._currentLipSync = null;
    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
    }
  }

  public playEmotion(preset: VRMExpressionPresetName, weight: number = 1) {
    console.log(`[ExpressionController] playEmotion called:`, { preset, weight });
    
    if (this._currentEmotion != "neutral") {
      console.log(`[ExpressionController] Resetting current emotion: ${this._currentEmotion}`);
      this._expressionManager?.setValue(this._currentEmotion, 0);
    }

    if (preset == "neutral") {
      console.log(`[ExpressionController] Setting neutral expression`);
      this._autoBlink?.setEnable(true);
      this._currentEmotion = preset;
      return;
    }

    const t = this._autoBlink?.setEnable(false) || 0;
    this._currentEmotion = preset;
    console.log(`[ExpressionController] Setting ${preset} expression with weight ${weight} after ${t}s`);
    setTimeout(() => {
      console.log(`[ExpressionController] Applying ${preset} expression with weight ${weight}`);
      this._expressionManager?.setValue(preset, weight);
    }, t * 1000);
  }
  
  // 複合感情の処理（複数の表情を同時に適用）
  public playComplexEmotion(emotions: Array<{name: VRMExpressionPresetName, weight: number}>) {
    console.log(`[ExpressionController] playComplexEmotion called:`, emotions);
    
    // 現在の感情をリセット
    if (this._currentEmotion != "neutral") {
      console.log(`[ExpressionController] Resetting current emotion: ${this._currentEmotion}`);
      this._expressionManager?.setValue(this._currentEmotion, 0);
    }
    
    // まばたきを無効化
    const t = this._autoBlink?.setEnable(false) || 0;
    
    // 複数の感情を同時に適用
    setTimeout(() => {
      console.log(`[ExpressionController] Applying complex emotions:`, emotions);
      emotions.forEach(emotion => {
        console.log(`[ExpressionController] Setting ${emotion.name} with weight ${emotion.weight}`);
        this._expressionManager?.setValue(emotion.name, emotion.weight);
      });
    }, t * 1000);
    
    // 現在の感情を複合感情の主要なものに設定
    this._currentEmotion = emotions[0].name;
  }

  public lipSync(preset: VRMExpressionPresetName, value: number) {
    if (this._currentLipSync) {
      this._expressionManager?.setValue(this._currentLipSync.preset, 0);
    }
    this._currentLipSync = {
      preset,
      value,
    };
  }

  public update(delta: number) {
    if (this._autoBlink) {
      this._autoBlink.update(delta);
    }

    if (this._currentLipSync) {
      const weight =
        this._currentEmotion === "neutral"
          ? this._currentLipSync.value * 0.5
          : this._currentLipSync.value * 0.25;
      this._expressionManager?.setValue(this._currentLipSync.preset, weight);
    }
  }
}
