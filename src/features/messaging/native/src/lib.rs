use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use js_sys::{Object, Reflect, Uint8Array};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use wasm_bindgen::prelude::*;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

const ENVELOPE_MAGIC: &[u8; 4] = b"BAR3";
const PUBLIC_KEY_LEN: usize = 32;
const PRIVATE_KEY_LEN: usize = 32;
const SALT_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const HEADER_LEN: usize = 4 + PUBLIC_KEY_LEN + SALT_LEN + NONCE_LEN;
const MAX_PLAINTEXT_BYTES: usize = 10 * 1024 * 1024;
const HKDF_INFO: &[u8] = b"baaro.messaging.v3.x25519-aes256gcm";
const AAD: &[u8] = b"baaro.messaging.envelope.v3";

fn fixed_array<const N: usize>(bytes: &[u8], label: &str) -> Result<[u8; N], String> {
    bytes
        .try_into()
        .map_err(|_| format!("{label} doit contenir exactement {N} octets."))
}

fn derive_aead_key(
    shared_secret: &[u8; 32],
    salt: &[u8; SALT_LEN],
) -> Result<Zeroizing<[u8; 32]>, String> {
    let hkdf = Hkdf::<Sha256>::new(Some(salt), shared_secret);
    let mut key = Zeroizing::new([0u8; 32]);
    hkdf.expand(HKDF_INFO, &mut key[..])
        .map_err(|_| "Dérivation HKDF impossible.".to_owned())?;
    Ok(key)
}

#[wasm_bindgen]
pub fn generate_identity_keypair() -> Result<JsValue, JsValue> {
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);
    let result = Object::new();
    Reflect::set(
        &result,
        &JsValue::from_str("publicKey"),
        &Uint8Array::from(public.as_bytes().as_slice()),
    )?;
    Reflect::set(
        &result,
        &JsValue::from_str("privateKey"),
        &Uint8Array::from(secret.as_bytes().as_slice()),
    )?;
    Ok(result.into())
}

/// Chiffre un message vers une identité X25519 avec une clé éphémère par message.
/// L'enveloppe BAR3 contient magic(4)|ephemeral_public(32)|salt(32)|nonce(12)|ciphertext+tag.
fn encrypt_message_v3_inner(plaintext: &[u8], recipient_public: &[u8]) -> Result<Vec<u8>, String> {
    if plaintext.is_empty() || plaintext.len() > MAX_PLAINTEXT_BYTES {
        return Err("Taille de message invalide.".to_owned());
    }
    let recipient_bytes = fixed_array::<PUBLIC_KEY_LEN>(recipient_public, "Clé publique")?;
    let recipient = PublicKey::from(recipient_bytes);
    let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let shared_secret = Zeroizing::new(ephemeral_secret.diffie_hellman(&recipient).to_bytes());
    if bool::from(shared_secret.ct_eq(&[0u8; 32])) {
        return Err("Échange X25519 invalide.".to_owned());
    }

    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    let key_bytes = derive_aead_key(&shared_secret, &salt)?;

    let cipher = Aes256Gcm::new_from_slice(&key_bytes[..])
        .map_err(|_| "Initialisation AES-GCM impossible.".to_owned())?;
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: AAD,
            },
        )
        .map_err(|_| "Chiffrement AES-GCM impossible.".to_owned())?;
    let mut envelope = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    envelope.extend_from_slice(ENVELOPE_MAGIC);
    envelope.extend_from_slice(ephemeral_public.as_bytes());
    envelope.extend_from_slice(&salt);
    envelope.extend_from_slice(&nonce);
    envelope.extend_from_slice(&ciphertext);
    Ok(envelope)
}

#[wasm_bindgen]
pub fn encrypt_message_v3(plaintext: &[u8], recipient_public: &[u8]) -> Result<Vec<u8>, JsValue> {
    encrypt_message_v3_inner(plaintext, recipient_public)
        .map_err(|message| JsValue::from_str(&message))
}

fn decrypt_message_v3_core(envelope: &[u8], recipient_private: &[u8]) -> Result<Vec<u8>, String> {
    if envelope.len() < HEADER_LEN + 16 || envelope.len() > HEADER_LEN + MAX_PLAINTEXT_BYTES + 16 {
        return Err("Enveloppe v3 de taille invalide.".to_owned());
    }
    if &envelope[..4] != ENVELOPE_MAGIC {
        return Err("Version d'enveloppe non prise en charge.".to_owned());
    }

    let private_bytes = Zeroizing::new(fixed_array::<PRIVATE_KEY_LEN>(
        recipient_private,
        "Clé privée",
    )?);
    let ephemeral_public =
        fixed_array::<PUBLIC_KEY_LEN>(&envelope[4..4 + PUBLIC_KEY_LEN], "Clé éphémère")?;
    let salt_start = 4 + PUBLIC_KEY_LEN;
    let salt = fixed_array::<SALT_LEN>(&envelope[salt_start..salt_start + SALT_LEN], "Sel")?;
    let nonce_start = salt_start + SALT_LEN;
    let nonce = fixed_array::<NONCE_LEN>(&envelope[nonce_start..nonce_start + NONCE_LEN], "Nonce")?;

    let recipient_secret = StaticSecret::from(*private_bytes);
    let shared_secret = Zeroizing::new(
        recipient_secret
            .diffie_hellman(&PublicKey::from(ephemeral_public))
            .to_bytes(),
    );
    if bool::from(shared_secret.ct_eq(&[0u8; 32])) {
        return Err("Échange X25519 invalide.".to_owned());
    }
    let key_bytes = derive_aead_key(&shared_secret, &salt)?;

    let cipher = Aes256Gcm::new_from_slice(&key_bytes[..])
        .map_err(|_| "Initialisation AES-GCM impossible.".to_owned())?;
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &envelope[nonce_start + NONCE_LEN..],
                aad: AAD,
            },
        )
        .map_err(|_| "Authentification ou déchiffrement impossible.".to_owned())?;
    if plaintext.is_empty() {
        return Err("Message vide non accepté.".to_owned());
    }
    Ok(plaintext)
}

fn decrypt_message_v3_inner(
    envelope: &[u8],
    recipient_private: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let recipient_private = Zeroizing::new(recipient_private);
    decrypt_message_v3_core(envelope, &recipient_private)
}

#[wasm_bindgen]
pub fn decrypt_message_v3(envelope: &[u8], recipient_private: Vec<u8>) -> Result<Vec<u8>, JsValue> {
    decrypt_message_v3_inner(envelope, recipient_private)
        .map_err(|message| JsValue::from_str(&message))
}

fn compute_safety_number_inner(public_a: &[u8], public_b: &[u8]) -> Result<String, String> {
    let a = fixed_array::<PUBLIC_KEY_LEN>(public_a, "Clé publique A")?;
    let b = fixed_array::<PUBLIC_KEY_LEN>(public_b, "Clé publique B")?;
    let (first, second) = if a <= b { (&a, &b) } else { (&b, &a) };
    let mut hasher = Sha256::new();
    hasher.update(b"baaro.safety-number.v3\0");
    hasher.update(first);
    hasher.update(second);
    let digest = hasher.finalize();
    let hex = digest[..20]
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<String>();
    Ok(hex
        .as_bytes()
        .chunks(5)
        .map(|part| std::str::from_utf8(part).unwrap_or(""))
        .collect::<Vec<_>>()
        .join(" "))
}

/// Empreinte courte, déterministe et indépendante de l'ordre des deux identités.
#[wasm_bindgen]
pub fn compute_safety_number(public_a: &[u8], public_b: &[u8]) -> Result<String, JsValue> {
    compute_safety_number_inner(public_a, public_b).map_err(|message| JsValue::from_str(&message))
}

/// Comparaison à temps constant sur des buffers de même longueur.
#[wasm_bindgen]
pub fn constant_time_equal(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && bool::from(a.ct_eq(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v3_encrypts_and_decrypts_for_the_recipient() {
        let secret = StaticSecret::random_from_rng(OsRng);
        let public = PublicKey::from(&secret);
        let plaintext = b"BAARO v3 test - UTF-8 handled as bytes";
        let envelope = encrypt_message_v3_inner(plaintext, public.as_bytes()).expect("encrypt");
        assert_eq!(&envelope[..4], ENVELOPE_MAGIC);
        let private_key = secret.as_bytes().to_vec();
        assert_eq!(
            decrypt_message_v3_inner(&envelope, private_key.clone()).expect("decrypt"),
            plaintext
        );
    }

    #[test]
    fn rejects_an_authenticated_empty_plaintext() {
        let recipient_secret = StaticSecret::random_from_rng(OsRng);
        let recipient_public = PublicKey::from(&recipient_secret);
        let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
        let ephemeral_public = PublicKey::from(&ephemeral_secret);
        let shared_secret = Zeroizing::new(
            ephemeral_secret
                .diffie_hellman(&recipient_public)
                .to_bytes(),
        );
        let salt = [7u8; SALT_LEN];
        let nonce = [8u8; NONCE_LEN];
        let key = derive_aead_key(&shared_secret, &salt).expect("derive key");
        let cipher = Aes256Gcm::new_from_slice(&key[..]).expect("cipher");
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), Payload { msg: &[], aad: AAD })
            .expect("encrypt empty plaintext");

        let mut envelope = Vec::new();
        envelope.extend_from_slice(ENVELOPE_MAGIC);
        envelope.extend_from_slice(ephemeral_public.as_bytes());
        envelope.extend_from_slice(&salt);
        envelope.extend_from_slice(&nonce);
        envelope.extend_from_slice(&ciphertext);
        let private_key = recipient_secret.as_bytes().to_vec();

        assert!(decrypt_message_v3_inner(&envelope, private_key).is_err());
    }

    #[test]
    fn v3_rejects_tampering_and_wrong_recipient() {
        let secret = StaticSecret::random_from_rng(OsRng);
        let public = PublicKey::from(&secret);
        let wrong_secret = StaticSecret::random_from_rng(OsRng);
        let mut envelope = encrypt_message_v3_inner(b"secret", public.as_bytes()).expect("encrypt");
        let wrong_private_key = wrong_secret.as_bytes().to_vec();
        assert!(decrypt_message_v3_inner(&envelope, wrong_private_key).is_err());
        let last = envelope.len() - 1;
        envelope[last] ^= 1;
        let private_key = secret.as_bytes().to_vec();
        assert!(decrypt_message_v3_inner(&envelope, private_key).is_err());
    }

    #[test]
    fn safety_number_is_stable_and_symmetric() {
        let a = StaticSecret::random_from_rng(OsRng);
        let b = StaticSecret::random_from_rng(OsRng);
        let a_public = PublicKey::from(&a);
        let b_public = PublicKey::from(&b);
        assert_eq!(
            compute_safety_number_inner(a_public.as_bytes(), b_public.as_bytes()).unwrap(),
            compute_safety_number_inner(b_public.as_bytes(), a_public.as_bytes()).unwrap()
        );
    }

    #[test]
    fn hkdf_sha256_matches_the_versioned_vector() {
        let shared_secret = std::array::from_fn(|index| index as u8);
        let salt = std::array::from_fn(|index| index as u8);
        let expected = [
            0x79, 0x3f, 0xca, 0x35, 0xbc, 0x9d, 0xe9, 0xde, 0xff, 0xd4, 0xf9, 0xaf, 0x7c, 0x26,
            0xc9, 0x62, 0x5a, 0xc7, 0x25, 0x1d, 0x93, 0x33, 0xc3, 0xd9, 0xd3, 0x5a, 0x08, 0x7e,
            0xe8, 0xd4, 0x2f, 0x11,
        ];

        assert_eq!(
            &derive_aead_key(&shared_secret, &salt).expect("HKDF vector")[..],
            &expected
        );
    }

    #[test]
    fn safety_number_matches_the_versioned_vector() {
        let public_a: Vec<u8> = (1..=32).collect();
        let public_b: Vec<u8> = (1..=32).rev().collect();

        assert_eq!(
            compute_safety_number_inner(&public_a, &public_b).unwrap(),
            "62716 8A8EF C9D7C E7FEE 8A314 7D622 AFDD5 155BA"
        );
    }

    #[test]
    fn constant_time_comparison_checks_equal_lengths() {
        assert!(constant_time_equal(b"abc", b"abc"));
        assert!(!constant_time_equal(b"abc", b"abd"));
        assert!(!constant_time_equal(b"abc", b"ab"));
    }

    #[test]
    fn rejects_wrong_key_lengths_and_unknown_envelopes() {
        assert!(encrypt_message_v3_inner(b"secret", b"short").is_err());
        let invalid_key = vec![0u8; PRIVATE_KEY_LEN];
        assert!(decrypt_message_v3_inner(b"not-an-envelope", invalid_key).is_err());

        let mut unknown_version = vec![0u8; HEADER_LEN + 16];
        assert!(decrypt_message_v3_core(&unknown_version, &[0u8; PRIVATE_KEY_LEN]).is_err());
        unknown_version[0..4].copy_from_slice(ENVELOPE_MAGIC);
        let invalid_private_key = vec![0u8; PRIVATE_KEY_LEN - 1];
        assert!(decrypt_message_v3_inner(&unknown_version, invalid_private_key).is_err());

        let oversized_plaintext = vec![0u8; MAX_PLAINTEXT_BYTES + 1];
        assert!(encrypt_message_v3_inner(&oversized_plaintext, &[1u8; PUBLIC_KEY_LEN]).is_err());
        assert!(!constant_time_equal(&[0u8; 32], &[0u8; 31]));
    }
}
