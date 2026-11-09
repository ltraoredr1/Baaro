//! Découpage WebVTT en blocs, identique à `parseVtt` de `lib/vtt.mjs` (version JS de repli).
//!
//! Un bloc est soit une ligne d'en-tête/NOTE sans horodatage (conservée telle quelle),
//! soit un « cue » : lignes de préfixe (identifiant), ligne d'horodatage, lignes de texte.

use crate::json;

#[derive(Debug, PartialEq, Eq)]
pub enum Block<'a> {
    Raw(&'a str),
    Cue {
        prefix: Vec<&'a str>,
        timing: &'a str,
        text: Vec<&'a str>,
    },
}

/// Même notion d'espace que `String.prototype.trim` en JavaScript (BOM compris).
fn is_js_space(c: char) -> bool {
    c.is_whitespace() || c == '\u{FEFF}'
}

/// Équivalent de `.replace(/^﻿/, "").replace(/\r/g, "").trim()`.
pub fn normalize(input: &str) -> String {
    let no_bom = input.strip_prefix('\u{FEFF}').unwrap_or(input);
    no_bom
        .replace('\r', "")
        .trim_matches(is_js_space)
        .to_string()
}

/// Équivalent de `/^WEBVTT(?:\s|$)/`.
fn has_header(s: &str) -> bool {
    match s.strip_prefix("WEBVTT") {
        Some(rest) => rest.chars().next().is_none_or(is_js_space),
        None => false,
    }
}

/// Équivalent de `split(/\n{2,}/)`.
fn split_blocks(s: &str) -> Vec<&str> {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let (mut start, mut i) = (0, 0);
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            let mut j = i;
            while j < bytes.len() && bytes[j] == b'\n' {
                j += 1;
            }
            if j - i >= 2 {
                out.push(&s[start..i]);
                start = j;
            }
            i = j;
        } else {
            i += 1;
        }
    }
    out.push(&s[start..]);
    out
}

pub fn parse(normalized: &str) -> Result<Vec<Block<'_>>, &'static str> {
    if !has_header(normalized) {
        return Err("La transcription ne contient pas un WebVTT valide");
    }
    Ok(split_blocks(normalized)
        .into_iter()
        .map(|block| {
            let lines: Vec<&str> = block.split('\n').collect();
            match lines.iter().position(|l| l.contains("-->")) {
                None => Block::Raw(block),
                Some(i) => Block::Cue {
                    prefix: lines[..i].to_vec(),
                    timing: lines[i],
                    text: lines[i + 1..].to_vec(),
                },
            }
        })
        .collect())
}

/// Sortie JSON, même forme que les objets renvoyés par la version JS.
pub fn to_json(blocks: &[Block<'_>]) -> String {
    let mut out = String::from("[");
    for (i, b) in blocks.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        match b {
            Block::Raw(raw) => {
                out.push_str("{\"raw\":");
                json::push_str(&mut out, raw);
                out.push_str(",\"timing\":null,\"text\":[]}");
            }
            Block::Cue {
                prefix,
                timing,
                text,
            } => {
                out.push_str("{\"raw\":null,\"prefix\":");
                json::push_str_array(&mut out, prefix);
                out.push_str(",\"timing\":");
                json::push_str(&mut out, timing);
                out.push_str(",\"text\":");
                json::push_str_array(&mut out, text);
                out.push('}');
            }
        }
    }
    out.push(']');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\u{FEFF}WEBVTT\r\n\r\nNOTE hello\r\n\r\n1\r\n00:00:00.000 --> 00:00:02.000\r\nBonjour\r\nle monde\r\n\r\n00:00:02.000 --> 00:00:04.000\r\nSalut\r\n";

    #[test]
    fn rejects_missing_header() {
        assert!(parse(&normalize("Bonjour")).is_err());
        assert!(parse(&normalize("WEBVTTX\n\n")).is_err());
        assert!(parse(&normalize("WEBVTT")).is_ok());
        assert!(parse(&normalize("WEBVTT - titre\n")).is_ok());
    }

    #[test]
    fn splits_cues_and_raw_blocks() {
        let n = normalize(SAMPLE);
        let blocks = parse(&n).unwrap();
        assert_eq!(blocks.len(), 4);
        assert_eq!(blocks[0], Block::Raw("WEBVTT"));
        assert_eq!(blocks[1], Block::Raw("NOTE hello"));
        assert_eq!(
            blocks[2],
            Block::Cue {
                prefix: vec!["1"],
                timing: "00:00:00.000 --> 00:00:02.000",
                text: vec!["Bonjour", "le monde"],
            }
        );
        assert_eq!(
            blocks[3],
            Block::Cue {
                prefix: vec![],
                timing: "00:00:02.000 --> 00:00:04.000",
                text: vec!["Salut"],
            }
        );
    }

    #[test]
    fn single_blank_line_with_spaces_does_not_split() {
        // Comme en JS : "\n \n" n'est pas une coupure /\n{2,}/.
        let n = normalize("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\na\n \nb\n");
        let blocks = parse(&n).unwrap();
        assert_eq!(blocks.len(), 2);
    }

    #[test]
    fn json_output() {
        let n = normalize("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n\"a\"\n");
        let j = to_json(&parse(&n).unwrap());
        assert_eq!(
            j,
            "[{\"raw\":\"WEBVTT\",\"timing\":null,\"text\":[]},{\"raw\":null,\"prefix\":[],\"timing\":\"00:00:00.000 --> 00:00:01.000\",\"text\":[\"\\\"a\\\"\"]}]"
        );
    }
}
