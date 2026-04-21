import path from 'path';

const config = {
  projectName: 'miniapp',
  date: '2026-04-20',
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify(
      process.env.TARO_APP_API_BASE ?? 'http://localhost:3001/api/v1',
    ),
  },
  copy: { patterns: [], options: {} },
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
  },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    esnextModules: ['@app/shared'],
    postcss: {
      autoprefixer: { enable: true, config: {} },
      cssModules: { enable: false },
    },
  },
};

export default function (merge: (a: any, b: any) => any) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev').default);
  }
  return merge({}, config, require('./prod').default);
}
