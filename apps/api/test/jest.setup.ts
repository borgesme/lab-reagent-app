// 默认关闭限流,避免 14 个 spec 跑 login 互相污染同 IP 桶。
// auth-redis.e2e-spec.ts 在文件最顶部主动 override 回 '1'。
process.env.RATE_LIMIT_ENABLED = '0';
