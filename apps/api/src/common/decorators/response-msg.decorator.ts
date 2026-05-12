import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MSG_KEY = 'response:msg';
export const ResponseMsg = (msg: string) => SetMetadata(RESPONSE_MSG_KEY, msg);
