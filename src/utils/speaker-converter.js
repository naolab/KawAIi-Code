/**
 * VoiceVOX話者リスト変換ユーティリティ
 *
 * VoiceVOXのAPI応答（階層構造）をアプリケーション内部で使用する
 * フラット構造に変換します。
 */

/**
 * VoiceVOX話者リストを階層構造からフラット構造に変換
 *
 * @param {Array} rawSpeakers - VoiceVOX APIから取得した話者リスト（階層構造）
 * @returns {Array} フラット化された話者リスト
 *
 * @example
 * // 入力（階層構造）
 * [{
 *   id: 1,
 *   name: "四国めたん",
 *   styles: [
 *     { id: 2, name: "ノーマル" },
 *     { id: 0, name: "あまあま" }
 *   ],
 *   speaker_uuid: "..."
 * }]
 *
 * // 出力（フラット構造）
 * [
 *   { id: 2, name: "四国めたん (ノーマル)", speaker_uuid: "..." },
 *   { id: 0, name: "四国めたん (あまあま)", speaker_uuid: "..." }
 * ]
 */
function convertVoiceVoxSpeakers(rawSpeakers) {
    if (!Array.isArray(rawSpeakers)) {
        console.error('convertVoiceVoxSpeakers: Invalid input - expected array, got:', typeof rawSpeakers);
        return [];
    }

    const converted = [];

    rawSpeakers.forEach(speaker => {
        // stylesプロパティが存在しない場合はスキップ
        if (!speaker.styles || !Array.isArray(speaker.styles)) {
            console.warn('convertVoiceVoxSpeakers: Speaker missing styles property:', speaker);
            return;
        }

        speaker.styles.forEach(style => {
            converted.push({
                id: style.id,
                name: `${speaker.name} (${style.name})`,
                speaker_uuid: speaker.speaker_uuid || null
            });
        });
    });

    return converted;
}

// CommonJS形式でエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { convertVoiceVoxSpeakers };
}

// グローバルスコープにも追加（ブラウザ環境用）
if (typeof window !== 'undefined') {
    window.SpeakerConverter = { convertVoiceVoxSpeakers };
}
