//! Test de faisabilité OpenMLS uniquement. Ce code n'est pas compilé dans le binaire WASM
//! et n'est pas appelé par le flux de messagerie BAARO.

use openmls::credentials::BasicCredential;
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use tls_codec::{Deserialize, Serialize};

const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

fn client_material(
    identity: &[u8],
    provider: &OpenMlsRustCrypto,
) -> (SignatureKeyPair, CredentialWithKey, KeyPackageBundle) {
    let credential = BasicCredential::new(identity.to_vec());
    let signer = SignatureKeyPair::new(CIPHERSUITE.signature_algorithm())
        .expect("generate test signing key");
    signer
        .store(provider.storage())
        .expect("store test signing key");

    let credential_with_key = CredentialWithKey {
        credential: credential.into(),
        signature_key: signer.to_public_vec().into(),
    };
    let key_package = KeyPackage::builder()
        .build(CIPHERSUITE, provider, &signer, credential_with_key.clone())
        .expect("build test KeyPackage");

    (signer, credential_with_key, key_package)
}

#[test]
fn openmls_two_clients_join_and_exchange_a_wire_encoded_message() {
    let alice_provider = OpenMlsRustCrypto::default();
    let bob_provider = OpenMlsRustCrypto::default();
    let (alice_signer, alice_credential, _alice_key_package) =
        client_material(b"test-user-alice-device-1", &alice_provider);
    let (_bob_signer, _bob_credential, bob_key_package) =
        client_material(b"test-user-bob-device-1", &bob_provider);

    let create_config = MlsGroupCreateConfig::builder()
        .ciphersuite(CIPHERSUITE)
        .build();
    let mut alice_group = MlsGroup::new(
        &alice_provider,
        &alice_signer,
        &create_config,
        alice_credential,
    )
    .expect("create Alice's MLS group");

    // Prototype only: in production this public KeyPackage must come from an authenticated,
    // one-time Delivery Service and the credential-to-user binding must be verified.
    let (commit, welcome, _) = alice_group
        .add_members(
            &alice_provider,
            &alice_signer,
            std::slice::from_ref(bob_key_package.key_package()),
        )
        .expect("add Bob to the test group");
    alice_group
        .merge_pending_commit(&alice_provider)
        .expect("merge Alice's pending commit");
    let _commit_wire = commit
        .tls_serialize_detached()
        .expect("serialize commit for delivery");
    let parsed_commit =
        MlsMessageIn::tls_deserialize_exact(&_commit_wire).expect("parse the serialized Commit");
    let _commit_protocol = parsed_commit
        .try_into_protocol_message()
        .expect("extract the MLS Commit");

    let welcome_wire = welcome
        .tls_serialize_detached()
        .expect("serialize Welcome for delivery");
    let welcome =
        MlsMessageIn::tls_deserialize_exact(&welcome_wire).expect("parse the serialized Welcome");
    let welcome = match welcome.extract() {
        MlsMessageBodyIn::Welcome(welcome) => welcome,
        _ => panic!("expected a Welcome message"),
    };
    let mut bob_group = StagedWelcome::new_from_welcome(
        &bob_provider,
        create_config.join_config(),
        welcome,
        Some(alice_group.export_ratchet_tree().into()),
    )
    .expect("stage Bob's join from Welcome")
    .into_group(&bob_provider)
    .expect("create Bob's group state");

    assert_eq!(alice_group.members().count(), 2);
    assert_eq!(bob_group.members().count(), 2);

    let plaintext = b"MLS prototype: authenticated application message";
    let outbound = alice_group
        .create_message(&alice_provider, &alice_signer, plaintext)
        .expect("create MLS application message");
    let wire = outbound
        .tls_serialize_detached()
        .expect("serialize MLS message for transport");
    let inbound =
        MlsMessageIn::tls_deserialize_exact(&wire).expect("parse the serialized MLS message");
    let protocol_message = inbound
        .try_into_protocol_message()
        .expect("extract the MLS protocol message");
    let processed = bob_group
        .process_message(&bob_provider, protocol_message)
        .expect("authenticate and process the MLS message");

    match processed.into_content() {
        ProcessedMessageContent::ApplicationMessage(message) => {
            assert_eq!(message.into_bytes(), plaintext);
        }
        other => panic!("expected an application message, got {other:?}"),
    }
}
