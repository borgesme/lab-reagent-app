// uview-plus 通过 uni_modules 方式安装在 src/uni_modules/uview-plus，
// 实际 import 路径是 '@/uni_modules/uview-plus'，但 uview-plus 自带的类型
// 声明在 src/uni_modules/uview-plus/types/index.d.ts 里写的是裸名 'uview-plus'。
// 这里把 '@/uni_modules/uview-plus' 转发到 'uview-plus'，复用现有完整类型。
declare module '@/uni_modules/uview-plus' {
  export * from 'uview-plus';
  export { default } from 'uview-plus';
}
