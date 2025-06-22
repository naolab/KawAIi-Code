import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // 静的エクスポートを有効化
  trailingSlash: true, // Electronでの読み込み互換性
  // 開発用インジケーターを完全無効化 (非推奨のため削除)
  // devIndicators: {
  //   buildActivity: false,
  // },
  // experimental.esmExternals はモジュール解決を妨げる可能性があるので削除
  // experimental: {
  //   esmExternals: false,
  // },
  webpack: (config, { isServer }) => {
    // Three.jsとVRM関連の設定
    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      exclude: /node_modules/,
      use: [
        'raw-loader',
        'glslify-loader'
      ]
    });

    // Three.jsの外部化を防ぐ
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }

    return config;
  },
  transpilePackages: ['three', '@pixiv/three-vrm']
};

export default nextConfig;
