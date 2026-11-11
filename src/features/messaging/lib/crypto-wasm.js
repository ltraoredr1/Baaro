export function resolveCryptoWasmUrl({
  isDev = Boolean(import.meta.env?.DEV),
  sourceUrl = import.meta.url,
  origin = globalThis.location?.origin,
} = {}) {
  if (isDev) {
    if (!origin) throw new Error("Origine de l'application indisponible pour le chargement WASM.");
    return new URL("/wasm/messaging_crypto.js", `${new URL(origin).origin}/`).href;
  }

  // En production, crypto-wasm.js est empaqueté dans dist/assets/ tandis que
  // public/wasm est copié dans dist/wasm. Le lien depuis import.meta.url
  // reste valable avec base='./', Capacitor et les routes SPA profondes.
  return new URL("../wasm/messaging_crypto.js", sourceUrl).href;
}

export function createCryptoWasmLoader(importer) {
  let wasmPromise;

  function load() {
    if (wasmPromise) return wasmPromise;

    const currentPromise = Promise.resolve()
      .then(importer)
      .then(async (wasm) => {
        await wasm.default();
        return wasm;
      })
      .catch((error) => {
        if (wasmPromise === currentPromise) wasmPromise = undefined;
        throw new Error(`Module BAARO messaging WASM indisponible : ${error?.message || error}`);
      });

    wasmPromise = currentPromise;
    return currentPromise;
  }

  load.reset = () => {
    wasmPromise = undefined;
  };

  return load;
}

const loadWasmModule = createCryptoWasmLoader(() =>
  import(/* @vite-ignore */ resolveCryptoWasmUrl())
);

/**
 * Charge le module v3 généré par wasm-pack.
 * Ce module n'est pas utilisé par crypto.js : les clés de compte et les
 * payloads RSA v1/v2 restent gérés par Web Crypto jusqu'à une migration conçue.
 */
export function initCryptoWasm() {
  return loadWasmModule();
}

export function createCryptoWasmApi(init = initCryptoWasm) {
  return {
    async generateIdentityKeyPairV3() {
      return (await init()).generate_identity_keypair();
    },
    async encryptMessageV3(plaintextBytes, recipientPublicKey) {
      return (await init()).encrypt_message_v3(plaintextBytes, recipientPublicKey);
    },
    async decryptMessageV3(envelope, recipientPrivateKey) {
      return (await init()).decrypt_message_v3(envelope, recipientPrivateKey);
    },
    async computeSafetyNumberV3(publicKeyA, publicKeyB) {
      return (await init()).compute_safety_number(publicKeyA, publicKeyB);
    },
    async constantTimeEqualV3(a, b) {
      return (await init()).constant_time_equal(a, b);
    },
  };
}

const api = createCryptoWasmApi();
export const generateIdentityKeyPairV3 = (...args) => api.generateIdentityKeyPairV3(...args);
export const encryptMessageV3 = (...args) => api.encryptMessageV3(...args);
export const decryptMessageV3 = (...args) => api.decryptMessageV3(...args);
export const computeSafetyNumberV3 = (...args) => api.computeSafetyNumberV3(...args);
export const constantTimeEqualV3 = (...args) => api.constantTimeEqualV3(...args);

export function resetCryptoWasmForTests() {
  loadWasmModule.reset();
}
