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
  private _audioControlled: boolean = true; // 常に音声制御モードを使用
  private _transitionActive: boolean = false; // トランジション実行中フラグ
  
  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._autoLookAt = new AutoLookAt(vrm, camera);
    this._currentEmotion = "neutral";
    this._currentLipSync = null;
    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
    }
  }

  // イージング関数付きの滑らかな表情変化
  private async transitionToEmotion(preset: VRMExpressionPresetName, targetWeight: number, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const startWeight = 0;
      
      console.log(`[ExpressionController] Starting transition: ${preset} -> ${targetWeight} (${duration}ms)`);
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // イージングアウト: だんだん遅くなる
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentWeight = startWeight + (targetWeight - startWeight) * eased;
        
        this._expressionManager?.setValue(preset, currentWeight);
        
        if (progress < 1) {
          setTimeout(animate, 16); // 約60FPS
        } else {
          console.log(`[ExpressionController] Transition completed: ${preset}`);
          resolve();
        }
      };
      
      animate();
    });
  }

  // 表情を滑らかにニュートラルに戻す
  private async transitionToNeutral(fromPreset: VRMExpressionPresetName, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      // 現在の実際の重みを取得
      const startWeight = this._expressionManager?.getValue(fromPreset) ?? 0;
      
      // 既に0の場合は即座に完了
      if (startWeight <= 0) {
        console.log(`[ExpressionController] ${fromPreset} is already neutral (weight: ${startWeight})`);
        resolve();
        return;
      }
      
      console.log(`[ExpressionController] Starting neutral transition: ${fromPreset} from ${startWeight} (${duration}ms)`);
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // イージングアウト
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentWeight = startWeight - (startWeight * eased);
        
        this._expressionManager?.setValue(fromPreset, currentWeight);
        
        if (progress < 1) {
          setTimeout(animate, 16);
        } else {
          console.log(`[ExpressionController] Neutral transition completed: ${fromPreset} (${startWeight} -> 0)`);
          resolve();
        }
      };
      
      animate();
    });
  }

  // 複合感情の滑らかなトランジション
  private async transitionToComplexEmotion(emotions: Array<{name: VRMExpressionPresetName, weight: number}>, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      console.log(`[ExpressionController] Starting complex transition: ${emotions.map(e => `${e.name}:${e.weight}`).join(', ')} (${duration}ms)`);
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // イージングアウト
        const eased = 1 - Math.pow(1 - progress, 3);
        
        emotions.forEach(emotion => {
          const currentWeight = emotion.weight * eased;
          this._expressionManager?.setValue(emotion.name, currentWeight);
        });
        
        if (progress < 1) {
          setTimeout(animate, 16);
        } else {
          console.log(`[ExpressionController] Complex transition completed`);
          resolve();
        }
      };
      
      animate();
    });
  }

  public async playEmotion(preset: VRMExpressionPresetName, weight: number = 1, duration: number = 2000) {
    console.log(`[ExpressionController] playEmotion called:`, { preset, weight, duration });
    
    // トランジション中の場合は待機
    while (this._transitionActive) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // 既存のタイマーをクリア
    if (this._emotionTimer) {
      clearTimeout(this._emotionTimer);
      this._emotionTimer = null;
    }
    
    // 現在の表情をスムーズにクリア
    if (this._currentEmotion != "neutral") {
      console.log(`[ExpressionController] Smoothly clearing current emotion: ${this._currentEmotion}`);
      this._transitionActive = true;
      await this.transitionToNeutral(this._currentEmotion, 200);
    }

    if (preset == "neutral") {
      console.log(`[ExpressionController] Setting neutral expression`);
      this._autoBlink?.setEnable(true);
      this._currentEmotion = preset;
      this._transitionActive = false;
      return;
    }

    const t = this._autoBlink?.setEnable(false) || 0;
    this._currentEmotion = preset;
    console.log(`[ExpressionController] Starting smooth transition to ${preset} with weight ${weight}`);
    
    setTimeout(async () => {
      console.log(`[ExpressionController] Starting smooth transition to ${preset}`);
      
      // スムーズなトランジションで表情を適用
      await this.transitionToEmotion(preset, weight, 300);
      this._transitionActive = false;
      
      // 音声制御モード専用のため、自動リセットタイマーは使用しない
      // 音声終了時にresetToNeutral()で手動リセットする
    }, t * 1000);
  }
  
  // 複合感情の処理（複数の表情を同時に適用）
  public async playComplexEmotion(emotions: Array<{name: VRMExpressionPresetName, weight: number}>, duration: number = 2000) {
    console.log(`[ExpressionController] playComplexEmotion called:`, emotions, `duration: ${duration}ms`);
    
    // トランジション中の場合は待機
    while (this._transitionActive) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // 既存のタイマーをクリア
    if (this._emotionTimer) {
      clearTimeout(this._emotionTimer);
      this._emotionTimer = null;
    }
    
    // 現在の感情をスムーズにクリア
    if (this._currentEmotion != "neutral") {
      console.log(`[ExpressionController] Smoothly clearing current emotion: ${this._currentEmotion}`);
      this._transitionActive = true;
      await this.transitionToNeutral(this._currentEmotion, 200);
    }
    
    // まばたきを無効化
    const t = this._autoBlink?.setEnable(false) || 0;
    
    // 複数の感情をスムーズに適用
    setTimeout(async () => {
      console.log(`[ExpressionController] Starting smooth complex emotion transition`);
      
      // スムーズなトランジションで複合感情を適用
      await this.transitionToComplexEmotion(emotions, 300);
      this._transitionActive = false;
      
      // 音声制御モード専用のため、自動リセットタイマーは使用しない
      // 音声終了時にresetToNeutral()で手動リセットする
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
  
  // 音声終了時に表情をニュートラルに戻す（グラデーション対応）
  public async resetToNeutral() {
    console.log(`[ExpressionController] Manually resetting to neutral with smooth transition`);
    
    // トランジション中の場合は待機
    while (this._transitionActive) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this._transitionActive = true;
    
    // 全表情をスムーズにニュートラルに戻す
    const allExpressions: VRMExpressionPresetName[] = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];
    
    const neutralizePromises = allExpressions.map(expression => {
      return this.transitionToNeutral(expression, 400);
    });
    
    // 全ての表情を並行してニュートラル化
    await Promise.all(neutralizePromises);
    
    this._autoBlink?.setEnable(true);
    this._currentEmotion = "neutral";
    this._audioControlled = false;
    this._transitionActive = false;
    
    console.log(`[ExpressionController] Smooth reset to neutral completed`);
    
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
