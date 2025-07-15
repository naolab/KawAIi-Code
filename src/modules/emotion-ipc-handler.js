// 感情データをIPC経由で受信してVRMViewerに送信
if (window.electronAPI && window.electronAPI.voice) {
    window.electronAPI.voice.onEmotionData((emotionData) => {
        console.log('🎭 感情データをIPC経由で受信:', emotionData);
        
        // iframeのVRMViewerに感情データを送信
        const vrmIframe = document.getElementById('vrm-iframe');
        if (vrmIframe && vrmIframe.contentWindow) {
            vrmIframe.contentWindow.postMessage({
                type: 'emotion',
                emotion: emotionData
            }, '*');
            console.log('🎭 感情データをVRMViewerに送信完了');
        }
    });
}