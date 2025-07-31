// 初回同意管理サービス
class ConsentService {
    constructor() {
        this.CONSENT_STORAGE_KEY = 'initial_consent_given';
        this.CONSENT_VERSION = '1.0.0'; // 利用規約更新時にバージョンアップ
        this.documentsLoaded = false;
        this.documents = {
            terms: '',
            privacy: '',
            license: ''
        };
    }

    // 初期化
    async initialize() {
        debugLog('🔒 ConsentService初期化開始');
        await this.loadLegalDocuments();
        this.setupEventListeners();
        debugLog('🔒 ConsentService初期化完了');
    }

    // 法的ドキュメントを読み込み
    async loadLegalDocuments() {
        try {
            debugLog('📄 法的ドキュメント読み込み開始');
            
            // Electron APIを使ってドキュメントを読み込み
            const results = await Promise.all([
                window.electronAPI.readFile('docs/legal/TERMS_OF_SERVICE.md'),
                window.electronAPI.readFile('docs/legal/PRIVACY_POLICY.md'),  
                window.electronAPI.readFile('docs/legal/LICENSE.md')
            ]);

            // APIは文字列を直接返すので、そのまま設定
            this.documents.terms = results[0];
            this.documents.privacy = results[1];
            this.documents.license = results[2];
            this.documentsLoaded = true;
            
            // プレビューを更新
            this.updateDocumentPreviews();
            
            debugLog('📄 法的ドキュメント読み込み完了');
        } catch (error) {
            debugError('❌ 法的ドキュメント読み込みエラー:', error);
            // フォールバック: 固定テキスト表示
            this.showFallbackDocuments();
        }
    }

    // フォールバック用ドキュメント表示
    showFallbackDocuments() {
        const termsPreview = document.getElementById('terms-preview');
        const privacyPreview = document.getElementById('privacy-preview');
        const licensePreview = document.getElementById('license-preview');

        if (termsPreview) {
            termsPreview.textContent = '利用規約: このアプリケーションを使用することで、利用規約に同意したものとみなされます。詳細はdocs/legal/TERMS_OF_SERVICE.mdをご確認ください。';
        }
        if (privacyPreview) {
            privacyPreview.textContent = 'プライバシーポリシー: このアプリケーションのプライバシー保護について。詳細はdocs/legal/PRIVACY_POLICY.mdをご確認ください。';
        }
        if (licensePreview) {
            licensePreview.textContent = 'ライセンス: このソフトウェアはMITライセンスの下で配布されています。詳細はdocs/legal/LICENSE.mdをご確認ください。';
        }
    }

    // ドキュメントプレビューを更新
    updateDocumentPreviews() {
        // プレビュー用にMarkdownから最初の数行を抽出
        const termsPreview = this.extractPreview(this.documents.terms);
        const privacyPreview = this.extractPreview(this.documents.privacy);
        const licensePreview = this.extractPreview(this.documents.license);

        const termsElement = document.getElementById('terms-preview');
        const privacyElement = document.getElementById('privacy-preview');
        const licenseElement = document.getElementById('license-preview');

        if (termsElement) termsElement.textContent = termsPreview;
        if (privacyElement) privacyElement.textContent = privacyPreview;
        if (licenseElement) licenseElement.textContent = licensePreview;
    }

    // テキストからプレビューを抽出（最初の200文字程度）
    extractPreview(text) {
        if (!text) return 'ドキュメントを読み込めませんでした。';
        
        // Markdownヘッダーを除去し、本文を抽出
        const lines = text.split('\n');
        let content = '';
        let foundContent = false;
        
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
                content += line + ' ';
                foundContent = true;
                if (content.length > 200) break;
            }
        }
        
        return foundContent ? content.trim() + '...' : 'ドキュメントを読み込めませんでした。';
    }

    // イベントリスナーを設定
    setupEventListeners() {
        // チェックボックスの状態変更を監視
        const checkboxes = ['terms-consent-checkbox', 'privacy-consent-checkbox', 'license-consent-checkbox'];
        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => this.updateConsentButton());
            }
        });

        // 全文表示ボタン
        const showFullButtons = [
            { id: 'show-full-terms', docType: 'terms', title: '利用規約' },
            { id: 'show-full-privacy', docType: 'privacy', title: 'プライバシーポリシー' },
            { id: 'show-full-license', docType: 'license', title: 'ライセンス' }
        ];

        showFullButtons.forEach(button => {
            const element = document.getElementById(button.id);
            if (element) {
                element.addEventListener('click', () => {
                    this.showFullDocument(button.docType, button.title);
                });
            }
        });

        // 同意ボタン
        const consentButton = document.getElementById('consent-agree-btn');
        if (consentButton) {
            consentButton.addEventListener('click', () => this.handleConsent());
        }

        // 全文表示モーダルの閉じるボタン
        const closeFullDocument = document.getElementById('close-full-document');
        if (closeFullDocument) {
            closeFullDocument.addEventListener('click', () => {
                document.getElementById('full-document-modal').style.display = 'none';
            });
        }
    }

    // 同意ボタンの有効/無効を更新
    updateConsentButton() {
        const checkboxes = [
            document.getElementById('terms-consent-checkbox'),
            document.getElementById('privacy-consent-checkbox'),
            document.getElementById('license-consent-checkbox')
        ];

        const allChecked = checkboxes.every(checkbox => checkbox && checkbox.checked);
        const consentButton = document.getElementById('consent-agree-btn');
        
        if (consentButton) {
            consentButton.disabled = !allChecked;
            consentButton.style.opacity = allChecked ? '1' : '0.5';
        }
    }

    // 全文表示
    showFullDocument(docType, title) {
        const modal = document.getElementById('full-document-modal');
        const titleElement = document.getElementById('full-document-title');
        const contentElement = document.getElementById('full-document-content');

        if (!modal || !titleElement || !contentElement) return;

        titleElement.textContent = title;
        contentElement.textContent = this.documents[docType] || 'ドキュメントを読み込めませんでした。';
        modal.style.display = 'flex';
    }

    // 同意処理
    async handleConsent() {
        try {
            debugLog('✅ 同意処理開始');
            
            // 同意情報をローカルストレージに保存
            const consentData = {
                version: this.CONSENT_VERSION,
                timestamp: Date.now(),
                termsAccepted: true,
                privacyAccepted: true,
                licenseAccepted: true
            };

            const unifiedConfig = getSafeUnifiedConfig();
            await unifiedConfig.set(this.CONSENT_STORAGE_KEY, consentData);
            
            // 同意画面を閉じる
            this.hideConsentModal();
            
            // アプリ初期化を再開
            if (window.terminalApp && typeof window.terminalApp.continueInitialization === 'function') {
                debugLog('🚀 同意完了 - アプリ初期化を再開');
                await window.terminalApp.continueInitialization();
            }
            
            debugLog('✅ 同意処理完了');
            
        } catch (error) {
            debugError('❌ 同意処理エラー:', error);
        }
    }

    // 同意済みかチェック
    async isConsentGiven() {
        try {
            const unifiedConfig = getSafeUnifiedConfig();
            const consentData = await unifiedConfig.get(this.CONSENT_STORAGE_KEY, null);
            
            if (!consentData) {
                debugLog('🔒 同意データなし - 初回同意が必要');
                return false;
            }

            // バージョンチェック（利用規約更新時の再同意）
            if (consentData.version !== this.CONSENT_VERSION) {
                debugLog('🔒 同意データバージョン不一致 - 再同意が必要');
                return false;
            }

            debugLog('🔒 同意済み確認完了');
            return true;
            
        } catch (error) {
            debugError('❌ 同意状態チェックエラー:', error);
            return false;
        }
    }

    // 初回同意画面を表示
    showConsentModal() {
        const modal = document.getElementById('initial-consent-modal');
        if (modal) {
            modal.style.display = 'flex';
            debugLog('🔒 初回同意画面を表示');
        }
    }

    // 初回同意画面を非表示
    hideConsentModal() {
        const modal = document.getElementById('initial-consent-modal');
        if (modal) {
            modal.style.display = 'none';
            debugLog('🔒 初回同意画面を非表示');
        }
    }

    // 初回起動チェックと同意画面表示
    async checkAndShowConsent() {
        const consentGiven = await this.isConsentGiven();
        
        if (!consentGiven) {
            debugLog('🔒 初回同意が必要 - 同意画面を表示');
            this.showConsentModal();
            return false; // アプリ初期化を停止
        }
        
        debugLog('🔒 同意済み - アプリ初期化を継続');
        return true; // アプリ初期化を継続
    }

    // 同意データをリセット（デバッグ用）
    async resetConsent() {
        try {
            const unifiedConfig = getSafeUnifiedConfig();
            // 統一設定システムを使って削除（設定保存と同じ方法で削除）
            await unifiedConfig.set(this.CONSENT_STORAGE_KEY, null);
            debugLog('🔒 同意データをリセットしました');
        } catch (error) {
            debugError('❌ 同意データリセットエラー:', error);
        }
    }
}

// グローバルエクスポート
window.ConsentService = ConsentService;