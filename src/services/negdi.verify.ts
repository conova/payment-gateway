import { createVerify, createPublicKey, KeyObject } from 'node:crypto';
import { negdiConfig } from '../config/negdi.js';

let cachedKey: KeyObject | null = null;

function getPublicKey(): KeyObject {
  if (cachedKey) return cachedKey;
  cachedKey = createPublicKey({
    key: negdiConfig.publicKey,
    format: 'pem',
    type: 'spki',
  });
  return cachedKey;
}

/**
 * Хариунд ирсэн `order` (объект) болон `ordersign` (base64 signature)-ийг
 * NEGDI-ийн public key-ээр RSA-SHA256-аар шалгана.
 *
 * `cleardata` нь `JSON.stringify(order)` байх ёстой. PDF баримтад PHP-ийн
 * `json_encode($order)`-той ижил үр дүн гарна. JavaScript-ийн `JSON.stringify`
 * нь default-аар key-ийн дарааллыг хадгалдаг ба escape-ийг өөрөөр хийдэггүй
 * учир ихэнх тохиолдолд нийцнэ. Хэрэв NEGDI-ийн талд key order ялгаатай бол
 * сервер-ээс ирсэн raw response string-ийг ашиглах хэрэгтэй (доор raw verify).
 */
export function verifyOrderSign(
  order: Record<string, unknown>,
  ordersignBase64: string,
): boolean {
  try {
    const sig = Buffer.from(ordersignBase64, 'base64');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(JSON.stringify(order), 'utf8');
    verifier.end();
    return verifier.verify(getPublicKey(), sig);
  } catch (_) {
    return false;
  }
}

/**
 * Хэрэв NEGDI-ийн raw response string өөр serialization-той бол энэ helper
 * дэмжинэ. Caller нь rawOrderJson-г NEGDI-ийн өгсөн форматаар дамжуулна
 * (response body-ээс `order` field-г string хэлбэрээр salgaj авах).
 */
export function verifyOrderSignRaw(
  rawOrderJson: string,
  ordersignBase64: string,
): boolean {
  try {
    const sig = Buffer.from(ordersignBase64, 'base64');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(rawOrderJson, 'utf8');
    verifier.end();
    return verifier.verify(getPublicKey(), sig);
  } catch (_) {
    return false;
  }
}
