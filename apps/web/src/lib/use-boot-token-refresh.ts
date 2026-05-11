'use client';
import { useEffect, useRef } from 'react';
import { tryRefresh } from './api-client';
import { useAuth } from './auth-store';
import { decodeJwtPayload } from './jwt';

/**
 * P0-3 上线过渡:水合后若发现当前 access token 缺 ver claim
 * (= 部署前签发的 legacy token),立即调一次 /auth/refresh 换发新对,
 * 避免下次请求时 ver=undefined → 401 风暴。
 *
 * 触发条件:hydrated && accessToken && payload.ver === undefined。
 * 每个 app 生命周期最多触发一次。新签 token 都带 ver,常态零流量。
 */
export function useBootTokenRefresh() {
  const hydrated = useAuth((s) => s.hydrated);
  const accessToken = useAuth((s) => s.tokens?.accessToken);
  const ran = useRef(false);

  useEffect(() => {
    if (!hydrated || !accessToken || ran.current) return;
    ran.current = true;
    const payload = decodeJwtPayload<{ ver?: number }>(accessToken);
    if (payload && payload.ver === undefined) {
      tryRefresh().catch(() => {
        /* silent: 后续 API 401 会走 clear() + redirect */
      });
    }
  }, [hydrated, accessToken]);
}
