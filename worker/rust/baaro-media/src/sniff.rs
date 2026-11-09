//! Détection du type réel d'un fichier à partir de ses premiers octets.
//!
//! Le worker télécharge des fichiers envoyés par des utilisateurs : l'extension
//! de la clé R2 ne prouve rien. On regarde la signature avant de lancer FFmpeg.

use crate::json;

/// Nombre d'octets lus au début du fichier.
pub const HEAD_LEN: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub struct Sniffed {
    pub kind: &'static str,
    pub mime: &'static str,
    /// Média que le worker sait traiter (vidéo, audio, image).
    pub media: bool,
    /// Type connu comme n'étant PAS un média : à refuser (exécutable, archive, page web…).
    pub danger: bool,
}

const fn media(kind: &'static str, mime: &'static str) -> Sniffed {
    Sniffed {
        kind,
        mime,
        media: true,
        danger: false,
    }
}

const fn danger(kind: &'static str, mime: &'static str) -> Sniffed {
    Sniffed {
        kind,
        mime,
        media: false,
        danger: true,
    }
}

const UNKNOWN: Sniffed = Sniffed {
    kind: "unknown",
    mime: "application/octet-stream",
    media: false,
    danger: false,
};

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

fn starts_with_ci(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.len() >= needle.len() && haystack[..needle.len()].eq_ignore_ascii_case(needle)
}

/// Texte HTML ou script déguisé : on ignore les espaces de tête.
fn looks_like_html(head: &[u8]) -> bool {
    let start = head
        .iter()
        .position(|b| !b.is_ascii_whitespace())
        .unwrap_or(head.len());
    let t = &head[start..];
    [
        &b"<!doctype html"[..],
        b"<html",
        b"<script",
        b"<?xml",
        b"<svg",
    ]
    .iter()
    .any(|p| starts_with_ci(t, p))
}

pub fn sniff(head: &[u8]) -> Sniffed {
    // Conteneur ISO (MP4, M4A, MOV) : taille (4 octets) puis "ftyp" puis marque.
    if head.len() >= 12 && &head[4..8] == b"ftyp" {
        return match &head[8..12] {
            b"M4A " | b"M4B " => media("m4a", "audio/mp4"),
            b"qt  " => media("mov", "video/quicktime"),
            _ => media("mp4", "video/mp4"),
        };
    }
    // EBML : WebM ou Matroska.
    if head.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        let window = &head[..head.len().min(64)];
        return if contains(window, b"webm") {
            media("webm", "video/webm")
        } else {
            media("mkv", "video/x-matroska")
        };
    }
    if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return media("jpg", "image/jpeg");
    }
    if head.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return media("png", "image/png");
    }
    if head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WAVE" {
        return media("wav", "audio/wav");
    }
    if head.starts_with(b"ID3") || (head.len() >= 2 && head[0] == 0xFF && head[1] & 0xE0 == 0xE0) {
        return media("mp3", "audio/mpeg");
    }

    // Types qui ne sont jamais un média valide.
    if head.starts_with(&[0x7F, b'E', b'L', b'F']) {
        return danger("elf", "application/x-elf");
    }
    if head.starts_with(b"MZ") {
        return danger("pe", "application/x-msdownload");
    }
    if head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06") {
        return danger("zip", "application/zip");
    }
    if head.starts_with(&[0x1F, 0x8B]) {
        return danger("gzip", "application/gzip");
    }
    if head.starts_with(b"%PDF") {
        return danger("pdf", "application/pdf");
    }
    if head.starts_with(b"#!") {
        return danger("script", "text/x-script");
    }
    if looks_like_html(head) {
        return danger("html", "text/html");
    }

    UNKNOWN
}

/// Sortie JSON de la commande `sniff`.
pub fn to_json(s: &Sniffed, size: u64) -> String {
    let mut out = String::from("{\"kind\":");
    json::push_str(&mut out, s.kind);
    out.push_str(",\"mime\":");
    json::push_str(&mut out, s.mime);
    out.push_str(&format!(
        ",\"media\":{},\"danger\":{},\"size\":{}}}",
        s.media, s.danger, size
    ));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(b: &[u8]) -> &'static str {
        sniff(b).kind
    }

    #[test]
    fn mp4_family() {
        assert_eq!(kind(b"\0\0\0\x20ftypisom\0\0\0\0"), "mp4");
        assert_eq!(kind(b"\0\0\0\x20ftypM4A \0\0\0\0"), "m4a");
        assert_eq!(kind(b"\0\0\0\x14ftypqt  \0\0\0\0"), "mov");
    }

    #[test]
    fn webm_vs_mkv() {
        let mut webm = vec![0x1A, 0x45, 0xDF, 0xA3, 0x42, 0x82, 0x84];
        webm.extend_from_slice(b"webm");
        assert_eq!(kind(&webm), "webm");
        let mut mkv = vec![0x1A, 0x45, 0xDF, 0xA3, 0x42, 0x82, 0x88];
        mkv.extend_from_slice(b"matroska");
        assert_eq!(kind(&mkv), "mkv");
    }

    #[test]
    fn images_and_audio() {
        assert_eq!(kind(&[0xFF, 0xD8, 0xFF, 0xE0]), "jpg");
        assert_eq!(
            kind(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
            "png"
        );
        assert_eq!(kind(b"RIFF\x24\0\0\0WAVEfmt "), "wav");
        assert_eq!(kind(b"ID3\x04\0\0"), "mp3");
        assert_eq!(kind(&[0xFF, 0xFB, 0x90, 0x00]), "mp3");
    }

    #[test]
    fn dangerous_types_are_flagged() {
        for (bytes, k) in [
            (&b"\x7FELF\x02\x01"[..], "elf"),
            (b"MZ\x90\0", "pe"),
            (b"PK\x03\x04\x14", "zip"),
            (b"\x1F\x8B\x08", "gzip"),
            (b"%PDF-1.7", "pdf"),
            (b"#!/bin/sh\n", "script"),
            (b"  \n<!DOCTYPE html><html>", "html"),
            (b"<svg xmlns=", "html"),
        ] {
            let s = sniff(bytes);
            assert_eq!(s.kind, k);
            assert!(s.danger && !s.media);
        }
    }

    #[test]
    fn unknown_is_not_dangerous() {
        let s = sniff(b"\x01\x02\x03 random bytes");
        assert_eq!(s, UNKNOWN);
        assert!(!s.danger);
        assert_eq!(sniff(b""), UNKNOWN);
    }

    #[test]
    fn json_shape() {
        let s = sniff(&[0xFF, 0xD8, 0xFF]);
        assert_eq!(
            to_json(&s, 3),
            "{\"kind\":\"jpg\",\"mime\":\"image/jpeg\",\"media\":true,\"danger\":false,\"size\":3}"
        );
    }
}
