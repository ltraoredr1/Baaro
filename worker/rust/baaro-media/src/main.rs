//! baaro-media — petits outils appelés par le worker Node.
//!
//!   baaro-media sniff <fichier>   → JSON du type réel (signature des premiers octets)
//!   baaro-media vtt-parse         → lit un WebVTT sur stdin, écrit les blocs en JSON
//!   baaro-media --version
//!
//! Codes de sortie : 0 succès, 1 erreur d'E/S, 2 usage ou entrée invalide.
//! Les messages d'erreur vont sur stderr.

mod json;
mod sniff;
mod vtt;

use std::fs::File;
use std::io::{self, Read, Write};
use std::process::ExitCode;

/// Plafond de lecture sur stdin (un WebVTT de plusieurs heures reste très en dessous).
const MAX_STDIN: u64 = 32 * 1024 * 1024;

fn fail(code: u8, msg: &str) -> ExitCode {
    eprintln!("baaro-media: {msg}");
    ExitCode::from(code)
}

fn cmd_sniff(path: &str) -> ExitCode {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) => return fail(1, &format!("ouverture impossible : {e}")),
    };
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut head = Vec::with_capacity(sniff::HEAD_LEN);
    if let Err(e) = file.take(sniff::HEAD_LEN as u64).read_to_end(&mut head) {
        return fail(1, &format!("lecture impossible : {e}"));
    }
    println!("{}", sniff::to_json(&sniff::sniff(&head), size));
    ExitCode::SUCCESS
}

fn cmd_vtt_parse() -> ExitCode {
    let mut raw = Vec::new();
    if let Err(e) = io::stdin().lock().take(MAX_STDIN + 1).read_to_end(&mut raw) {
        return fail(1, &format!("lecture de stdin impossible : {e}"));
    }
    if raw.len() as u64 > MAX_STDIN {
        return fail(2, "entrée trop volumineuse");
    }
    let text = String::from_utf8_lossy(&raw);
    let normalized = vtt::normalize(&text);
    match vtt::parse(&normalized) {
        Ok(blocks) => {
            let mut out = io::stdout().lock();
            if writeln!(out, "{}", vtt::to_json(&blocks)).is_err() {
                return fail(1, "écriture impossible");
            }
            ExitCode::SUCCESS
        }
        Err(msg) => fail(2, msg),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["--version"] => {
            println!("baaro-media {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        ["sniff", path] => cmd_sniff(path),
        ["vtt-parse"] => cmd_vtt_parse(),
        _ => fail(
            2,
            "usage : baaro-media sniff <fichier> | vtt-parse | --version",
        ),
    }
}
