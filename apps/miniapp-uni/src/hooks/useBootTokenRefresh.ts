import { useAuth } from '@/stores/auth';
import { tryRefresh } from '@/api/request';
import { decodeJwtPayload } from '@/utils/jwt';

let ran = false;

export function useBootTokenRefresh() {
  if (ran) return;
  ran = true;
  const accessToken = useAuth().tokens?.accessToken;
  if (!accessToken) return;
  const payload = decodeJwtPayload<{ ver?: number }>(accessToken);
  if (payload && payload.ver === undefined) {
    tryRefresh().catch(() => {
      /* silent: 后续 API 401 会触发 clear + reLaunch */
    });
  }
}

export function __resetBootGuard() {
  ran = false;
}
