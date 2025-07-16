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
  private _emotionTimer: NodeJS.Timeout | null = null;
  private _audioControlled: boolean = false;
  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._autoLookAt = new AutoLookAt(vrm, camera);
    this._currentEmotion = "neutral";
    this._currentLipSync = null;
    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
    }
  }

  public playEmotion(preset: VRMExpressionPresetName, weight: number = 1, duration: number = 2000) {
    console.log(`[ExpressionController] playEmotion called:`, { preset, weight, duration });
    
    // 既存のタイマーをクリア
    if (this._emotionTimer) {
      clearTimeout(this._emotionTimer);
      this._emotionTimer = null;
    }
    
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
    console.log(`[ExpressionController] Setting ${preset} expression with weight ${weight} after ${t}s, duration ${duration}ms`);
    
    setTimeout(() => {
      console.log(`[ExpressionController] Applying ${preset} expression with weight ${weight}`);
      this._expressionManager?.setValue(preset, weight);
      
      // 音声制御モードでない場合のみ自動リセットタイマーを設定
      if (!this._audioControlled) {
        this._emotionTimer = setTimeout(() => {
          console.log(`[ExpressionController] Returning to neutral after ${duration}ms`);
          this._expressionManager?.setValue(preset, 0);
          this._autoBlink?.setEnable(true);
          this._currentEmotion = "neutral";
          this._emotionTimer = null;
        }, duration);
      }
    }, t * 1000);
  }
  
  // 複合感情の処理（複数の表情を同時に適用）
  public playComplexEmotion(emotions: Array<{name: VRMExpressionPresetName, weight: number}>, duration: number = 2000) {
    console.log(`[ExpressionController] playComplexEmotion called:`, emotions, `duration: ${duration}ms`);
    
    // 既存のタイマーをクリア
    if (this._emotionTimer) {
      clearTimeout(this._emotionTimer);
      this._emotionTimer = null;
    }
    
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
      
      // 音声制御モードでない場合のみ自動リセットタイマーを設定
      if (!this._audioControlled) {
        this._emotionTimer = setTimeout(() => {
          console.log(`[ExpressionController] Returning complex emotions to neutral after ${duration}ms`);
          emotions.forEach(emotion => {
            this._expressionManager?.setValue(emotion.name, 0);
          });
          this._autoBlink?.setEnable(true);
          this._currentEmotion = "neutral";
          this._emotionTimer = null;
        }, duration);
      }
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

  // 音声制御モードの設定・解除
  public setAudioControlled(enabled: boolean) {
    console.log(`[ExpressionController] Audio controlled mode: ${enabled}`);
    this._audioControlled = enabled;
    
    // 音声制御モードを無効にする場合、既存のタイマーをクリア
    if (!enabled && this._emotionTimer) {
      clearTimeout(this._emotionTimer);
      this._emotionTimer = null;
    }
  }
  
  // 音声終了時に表情をニュートラルに戻す
  public resetToNeutral() {
    console.log(`[ExpressionController] Manually resetting to neutral`);
    
    if (this._currentEmotion !== "neutral") {
      this._expressionManager?.setValue(this._currentEmotion, 0);
    }
    
    this._autoBlink?.setEnable(true);
    this._currentEmotion = "neutral";
    this._audioControlled = false;
    
    if (this._emotionTimer) {
      clearTimeout(this._emotionTimer);
      this._emotionTimer = null;
    }
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
