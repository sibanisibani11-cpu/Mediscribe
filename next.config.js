// @ts-check
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

/** @param {string} phase
 *  @returns {import('next').NextConfig}
 */
const nextConfig = (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    ...(isDev
      ? {
          assetPrefix: '',
          basePath: '',
        }
      : {
          output: 'export',
          trailingSlash: true,
          skipTrailingSlashRedirect: true,
          distDir: 'out',
          assetPrefix: './',
          basePath: '',
        }),
    typescript: {
      ignoreBuildErrors: true,
    },
    eslint: {
      ignoreDuringBuilds: true,
    },
    webpack: (config, { isServer }) => {
      // Enable WebAssembly support
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        layers: true,
      };

      // Add rule for .wasm files
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'webassembly/async',
      });

      // For transformers.js - resolve fallbacks for node modules
      if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          fs: false,
          path: false,
          crypto: false,
        };
      }

      return config;
    },
    images: {
      unoptimized: true,
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'placehold.co',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'images.unsplash.com',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/**',
        },
      ],
    },
  };
};

module.exports = nextConfig;
