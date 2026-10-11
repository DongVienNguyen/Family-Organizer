import { AppDeliveryError } from './appErrors.js';
import { getAppCommandContext } from './commandContext.js';

/** Existing Telegram provider only; bounded and explicit about uncertain outcomes. */
export async function postTelegram(token: string, endpoint: 'sendMessage' | 'sendDocument', options: RequestInit): Promise<any> {
  getAppCommandContext()?.assertWriteOwnership?.();
  const timeout = AbortSignal.timeout(15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try { response = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, { ...options, method: 'POST', signal }); }
  catch { throw new AppDeliveryError('Telegram delivery outcome is unknown', true); }
  const rejected = response.status >= 400 && response.status < 500;
  let data: any;
  try { data = await response.json(); }
  catch { throw new AppDeliveryError('Telegram acknowledgement is unavailable', !rejected); }
  if (!response.ok || data?.ok !== true) throw new AppDeliveryError('Telegram rejected delivery', !(rejected || data?.ok === false));
  return data;
}
