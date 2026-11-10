//! baaro-media — outil natif Rust/C de validation des médias du worker BAARO.
//!
//!   baaro-media sniff <fichier>   → signature du fichier + validation C/libavformat
//!   baaro-media --version
//!
//! Codes de sortie : 0 succès de la commande, 1 erreur d'E/S, 2 usage invalide.
//! Un conteneur invalide est retourné dans le JSON, puis refusé par Node.

mod json;
mod probe;
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

    let detected = sniff::sniff(&head);
    let (probe, probe_error) = if detected.media {
        match probe::validate(path) {
            Ok(info) => (Some(info), None),
            Err(code) => (None, Some(code)),
        }
    } else {
        (None, None)
    };

    println!("{}", sniff::to_json(&detected, size, probe, probe_error));
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
            println!(
                "baaro-media {} (libavformat {})",
                env!("CARGO_PKG_VERSION"),
                probe::libavformat_version()
            );
            ExitCode::SUCCESS
        }
        ["sniff", path] => cmd_sniff(path),
        _ => fail(2, "usage : baaro-media sniff <fichier> | --version"),
    }
}
