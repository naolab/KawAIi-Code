const Logger = require('./utils/logger');

const logger = Logger.create('EmotionAnalyzer');

/**
 * ニコの感情分析モジュール
 * emotion_mapping_proposal.mdに基づいて実装
 */
class EmotionAnalyzer {
    constructor() {
        // 感情パターン定義（優先順位順）
        this.emotionPatterns = [
            // 1. 照れ系（最優先）
            // 重度の照れ
            {
                name: '重度の照れ',
                emotions: [
                    { name: 'surprised', weight: 0.5 },
                    { name: 'sad', weight: 0.5 }
                ],
                patterns: [
                    /[なそばちまや]、[なそばちまや]、/,  // 吃音
                    /からかってるのか[！!？?]/,
                    /恥ずかしい[！!？?]/,
                    /冗談だろ[！!？?]/,
                    /バカ[！!]/,
                ],
                keywords: ['からかって', '恥ずかしい', '冗談だろ', 'バカ！'],
                priority: 10,
                duration: 2000
            },
            // 中度の照れ
            {
                name: '中度の照れ',
                emotions: [
                    { name: 'surprised', weight: 0.3 },
                    { name: 'sad', weight: 0.3 }
                ],
                patterns: [
                    /[べそち]、[べそち].*に/,  // 軽い吃音
                    /勘違いするな/,
                    /なんでもない[！!]?/,
                    /そういうわけじゃない/,
                ],
                keywords: ['べ、別に', 'そ、そんな', 'ち、違う', '勘違い', 'なんでもない'],
                priority: 9,
                duration: 1500
            },
            // 軽度の照れ
            {
                name: '軽度の照れ',
                emotions: [
                    { name: 'surprised', weight: 0.1 },
                    { name: 'happy', weight: 0.1 }
                ],
                patterns: [
                    /\.\.\.別に/,
                    /\.\.\.たまたま/,
                    /お前のためじゃない/,
                    /普通だろ/,
                ],
                keywords: ['...別に', '...たまたまだ', '...お前のためじゃない', '...まあ、少しは'],
                priority: 8,
                duration: 1000
            },
            
            // 2. 驚き系
            {
                name: '驚き',
                emotion: 'surprised',
                weight: 0.3,
                patterns: [
                    /^え[！!？?]+$/,
                    /^えっ[！!]+$/,
                    /マジか/,
                    /本当か[？?]/,
                    /嘘だろ/,
                    /なんだって[？?]/,
                ],
                keywords: ['え！？', 'えっ！', 'おお！', 'わっ！', 'マジか', '本当か？', '嘘だろ'],
                priority: 7,
                duration: 500
            },
            
            // 3. 呆れ系（複合感情）
            {
                name: '呆れ',
                emotions: [
                    { name: 'angry', weight: 0.4 },
                    { name: 'sad', weight: 0.3 }
                ],
                patterns: [
                    /はあ[？?]/,
                    /はぁ.*何やって/,
                    /マジで言ってるのか[？?]/,
                    /大丈夫かお前/,
                    /意味分からん/,
                ],
                keywords: ['はあ？', 'マジで言ってるのか？', '大丈夫かお前', '何それ'],
                priority: 6,
                duration: 1200
            },
            
            // 4. 怒り系
            // 真剣な注意
            {
                name: '真剣な注意',
                emotion: 'angry',
                weight: 0.7,
                patterns: [
                    /いい加減にしろ/,
                    /ちゃんとしろよ/,
                    /ダメだ、それは/,
                    /気をつけろよ/,
                    /しっかりしろ/,
                ],
                keywords: ['いい加減にしろ', 'ちゃんとしろよ', 'ダメだ', '気をつけろよ', 'しっかりしろ'],
                priority: 5,
                duration: 1500
            },
            // 軽いツッコミ
            {
                name: '軽いツッコミ',
                emotion: 'angry',
                weight: 0.4,
                patterns: [
                    /ちょっと待て/,
                    /違うぞ/,
                    /おかしくない[か？?]/,
                    /逆だろ/,
                    /矛盾してる/,
                ],
                keywords: ['ちょっと待て', 'おい', '違うぞ', 'おかしくないか？', '逆だろ'],
                priority: 4,
                duration: 1000
            },
            
            // 5. 悲しみ系
            // 深い悲しみ
            {
                name: '深い悲しみ',
                emotion: 'sad',
                weight: 0.75,
                patterns: [
                    /また失敗か/,
                    /全然ダメだ/,
                    /もう無理かもしれない/,
                    /諦めるしかない/,
                    /何度やってもダメ/,
                ],
                keywords: ['また失敗か', '全然ダメだ', 'もう無理', '諦める', '何度やってもダメ'],
                priority: 3,
                duration: 2000
            },
            // 失敗・困惑
            {
                name: '失敗・困惑',
                emotion: 'sad',
                weight: 0.5,
                patterns: [
                    /参った/,
                    /困った/,
                    /だめだった/,
                    /失敗/,
                    /やっちゃった/,
                    /ミスった/,
                    /エラー/,
                ],
                keywords: ['参った', '困った', 'だめだった', '失敗', 'やっちゃった', 'ミスった', 'エラー'],
                priority: 2,
                duration: 1500
            },
            // 軽い困惑
            {
                name: '軽い困惑',
                emotion: 'sad',
                weight: 0.3,
                patterns: [
                    /うーん/,
                    /どうしよう/,
                    /心配/,
                    /不安/,
                    /微妙/,
                    /分からん/,
                    /仕方ない/,
                ],
                keywords: ['うーん', 'どうしよう', '心配', '不安', '微妙', '分からん', '仕方ない', 'しょうがない'],
                priority: 1,
                duration: 1000
            },
            
            // 6. 喜び系
            {
                name: '喜び',
                emotion: 'happy',
                weight: 0.15,
                patterns: [
                    /できた[！!]?/,
                    /うまくいった/,
                    /よし[！!、]/,
                    /完了/,
                    /成功/,
                    /えへ/,
                    /あはは/,
                    /ふふ/,
                    /すごいな/,
                    /いいじゃないか/,
                    /綺麗/,
                ],
                keywords: ['できた', 'うまくいった', 'よし', '完了', '成功', 'えへ', 'あはは', 'ふふ', 'へへ', 'すごいな', 'いいじゃないか'],
                priority: 0,
                duration: 1500
            },
            
            // 7. その他の感情
            // 感謝（照れを伴う）
            {
                name: '感謝',
                emotions: [
                    { name: 'surprised', weight: 0.1 },
                    { name: 'happy', weight: 0.1 }
                ],
                patterns: [
                    /ありがとな/,
                    /助かった/,
                    /感謝してる/,
                    /サンキュー/,
                    /恩に着る/,
                ],
                keywords: ['ありがとな', '助かった', '感謝', 'サンキュー', '恩に着る'],
                priority: 0,
                duration: 1000
            },
            // 謝罪
            {
                name: '謝罪',
                emotion: 'sad',
                weight: 0.5,
                patterns: [
                    /悪かった/,
                    /間違ってた/,
                    /すまない/,
                    /ごめん/,
                    /申し訳ない/,
                ],
                keywords: ['悪かった', '間違ってた', 'すまない', 'ごめん', '申し訳ない'],
                priority: 0,
                duration: 1500
            }
        ];
        
        // デフォルト感情
        this.defaultEmotion = {
            name: 'neutral',
            emotion: 'neutral',
            weight: 0,
            duration: 0
        };
    }
    
    /**
     * テキストから感情を分析
     * @param {string} text - 分析対象のテキスト
     * @returns {Object} 感情分析結果
     */
    analyzeEmotion(text) {
        if (!text || typeof text !== 'string') {
            logger.warn('感情分析: 無効なテキスト:', text);
            return this.defaultEmotion;
        }
        
        logger.debug('感情分析開始:', text);
        
        // 優先順位順にパターンをチェック
        for (const pattern of this.emotionPatterns) {
            // 正規表現チェック
            if (pattern.patterns) {
                for (const regex of pattern.patterns) {
                    if (regex.test(text)) {
                        const result = this.createEmotionResult(pattern);
                        logger.info(`感情検出: ${pattern.name} (正規表現マッチ)`, {
                            pattern: pattern.name,
                            regex: regex.toString(),
                            result: result
                        });
                        return result;
                    }
                }
            }
            
            // キーワードチェック
            if (pattern.keywords) {
                for (const keyword of pattern.keywords) {
                    if (text.includes(keyword)) {
                        const result = this.createEmotionResult(pattern);
                        logger.info(`感情検出: ${pattern.name} (キーワード: ${keyword})`, {
                            pattern: pattern.name,
                            keyword: keyword,
                            result: result
                        });
                        return result;
                    }
                }
            }
        }
        
        logger.debug('感情検出なし、デフォルトを返却:', text);
        return this.defaultEmotion;
    }
    
    /**
     * 感情結果オブジェクトを作成
     * @param {Object} pattern - 感情パターン
     * @returns {Object} 感情結果
     */
    createEmotionResult(pattern) {
        if (pattern.emotions) {
            // 複合感情の場合
            return {
                name: pattern.name,
                emotions: pattern.emotions,
                duration: pattern.duration || 1000,
                isComplex: true
            };
        } else {
            // 単一感情の場合
            return {
                name: pattern.name,
                emotion: pattern.emotion,
                weight: pattern.weight,
                duration: pattern.duration || 1000,
                isComplex: false
            };
        }
    }
    
    /**
     * 感情の遷移を管理（将来の拡張用）
     * @param {Object} currentEmotion - 現在の感情
     * @param {Object} nextEmotion - 次の感情
     * @returns {Array} 遷移ステップの配列
     */
    createEmotionTransition(currentEmotion, nextEmotion) {
        // 照れ隠しパターンなど、特定の遷移を定義
        if (currentEmotion.name === '驚き' && nextEmotion.name.includes('照れ')) {
            return [
                currentEmotion,
                { emotion: 'neutral', weight: 0, duration: 200 },
                nextEmotion
            ];
        }
        
        // デフォルトは直接遷移
        return [nextEmotion];
    }
}

module.exports = EmotionAnalyzer;