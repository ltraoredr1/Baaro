//! baaro-media — petit outil de validation de fichiers appelé par le worker Node.
//!
//!   baaro-media sniff <fichier>   → JSON du type réel (signature des premiers octets)
//!   baaro-media --version
//!
//! Codes de sortie : 0 succès, 1 erreur d'E/S, 2 usage ou entrée invalide.
//! Les messages d'erreur vont sur stderr.

mod json;
mod sniff;

use std::fs::File;
use std::io::Read;
use std::process::ExitCode;

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
        _ => fail(2, "usage : baaro-media sniff <fichier> | --version"),
    }
}
