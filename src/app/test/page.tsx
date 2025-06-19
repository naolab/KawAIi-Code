export default function TestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center">
      <div className="bg-white/20 backdrop-blur-lg rounded-3xl p-8 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">🌟 テストページ 🌟</h1>
        <p className="text-white text-lg">Next.jsアプリが正常に動作しています！</p>
        <div className="mt-6">
          <div className="animate-pulse bg-white/30 rounded-lg p-4">
            <p className="text-white">VRMビューアーの準備完了〜！</p>
          </div>
        </div>
      </div>
    </div>
  );
}