const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

// Force zustand CJS on web (ESM uses import.meta.env which Metro can't parse)
const zustandRoot = path.dirname(require.resolve('zustand/package.json'));
const zustandCjsMap = {
  zustand: path.join(zustandRoot, 'index.js'),
  'zustand/middleware': path.join(zustandRoot, 'middleware.js'),
  'zustand/shallow': path.join(zustandRoot, 'shallow.js'),
  'zustand/vanilla': path.join(zustandRoot, 'vanilla.js'),
  'zustand/react': path.join(zustandRoot, 'react.js'),
  'zustand/traditional': path.join(zustandRoot, 'traditional.js'),
};

// Resolve the canonical (real, non-symlinked) paths for singleton packages.
// pnpm hoists multiple React versions and @expo/metro-runtime picks up React 18
// while the app uses React 19, causing "Objects are not valid as a React child".
const singletons = {
  react: fs.realpathSync(path.dirname(require.resolve('react/package.json'))),
  'react-dom': fs.realpathSync(path.dirname(require.resolve('react-dom/package.json'))),
};

// Custom resolver
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force single React instance: any import of 'react' or 'react/...' resolves to
  // the app's version regardless of where in the dependency tree it's imported from.
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const subpath = moduleName === 'react' ? '' : moduleName.slice('react'.length);
    const target = subpath
      ? path.join(singletons.react, subpath)
      : path.join(singletons.react, 'index.js');
    // Verify file exists, then return sourceFile resolution
    if (fs.existsSync(target + '.js')) {
      return { type: 'sourceFile', filePath: target + '.js' };
    }
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isFile()) {
        return { type: 'sourceFile', filePath: target };
      }
      // It's a directory, look for index.js
      const indexPath = path.join(target, 'index.js');
      if (fs.existsSync(indexPath)) {
        return { type: 'sourceFile', filePath: indexPath };
      }
    }
  }

  if (moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    const subpath = moduleName === 'react-dom' ? '' : moduleName.slice('react-dom'.length);
    const target = subpath
      ? path.join(singletons['react-dom'], subpath)
      : path.join(singletons['react-dom'], 'index.js');
    if (fs.existsSync(target + '.js')) {
      return { type: 'sourceFile', filePath: target + '.js' };
    }
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isFile()) {
        return { type: 'sourceFile', filePath: target };
      }
      const indexPath = path.join(target, 'index.js');
      if (fs.existsSync(indexPath)) {
        return { type: 'sourceFile', filePath: indexPath };
      }
    }
  }

  if (platform === 'web') {
    // Remap zustand to CJS to avoid import.meta.env
    if (zustandCjsMap[moduleName]) {
      return {
        type: 'sourceFile',
        filePath: zustandCjsMap[moduleName],
      };
    }

    const blocked = [
      '@solana/web3.js',
      '@solana-mobile/mobile-wallet-adapter-protocol',
      '@solana-mobile/mobile-wallet-adapter-protocol-web3js',
      '@noble/hashes',
      '@noble/curves',
      '@noble/ed25519',
    ];

    for (const pkg of blocked) {
      if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
        return { type: 'empty' };
      }
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Force default transform profile for web (not hermes)
config.transformer = {
  ...config.transformer,
  getTransformOptions: async (entryPoints, options) => {
    const isWeb = options.platform === 'web';
    return {
      transform: {
        experimentalImportSupport: false,
        inlineRequires: !isWeb,
        unstable_transformProfile: isWeb ? 'default' : 'hermes-stable',
      },
    };
  },
};

module.exports = config;
