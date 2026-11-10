use std::env;
use std::path::PathBuf;
use std::process::Command;

fn output(command: &str, args: &[&str]) -> String {
    let result = Command::new(command)
        .args(args)
        .output()
        .unwrap_or_else(|error| panic!("Impossible d’exécuter {command}: {error}"));
    if !result.status.success() {
        panic!(
            "{command} {} a échoué: {}",
            args.join(" "),
            String::from_utf8_lossy(&result.stderr)
        );
    }
    String::from_utf8(result.stdout)
        .unwrap_or_else(|error| panic!("Sortie UTF-8 invalide de {command}: {error}"))
}

fn main() {
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR"));
    let source = manifest.join("csrc/media_probe.c");
    let object = out_dir.join("media_probe.o");
    let archive = out_dir.join("libbaaro_media_probe.a");

    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-env-changed=CC");
    println!("cargo:rerun-if-env-changed=AR");
    println!("cargo:rerun-if-env-changed=PKG_CONFIG");

    let pkg_config = env::var("PKG_CONFIG").unwrap_or_else(|_| "pkg-config".to_owned());
    let cflags = output(&pkg_config, &["--cflags", "libavformat"]);
    let libs = output(
        &pkg_config,
        &["--libs", "libavformat", "libavcodec", "libavutil"],
    );

    let cc = env::var("CC").unwrap_or_else(|_| "cc".to_owned());
    let mut compile = Command::new(cc);
    compile
        .args([
            "-std=c11", "-O2", "-fPIC", "-Wall", "-Wextra", "-Werror", "-c",
        ])
        .arg(&source)
        .arg("-o")
        .arg(&object);
    compile.args(cflags.split_whitespace());
    let status = compile
        .status()
        .expect("Impossible de lancer le compilateur C");
    assert!(status.success(), "La compilation du validateur C a échoué");

    let ar = env::var("AR").unwrap_or_else(|_| "ar".to_owned());
    let status = Command::new(ar)
        .args(["crs"])
        .arg(&archive)
        .arg(&object)
        .status()
        .expect("Impossible de lancer ar");
    assert!(status.success(), "La création de l’archive C a échoué");

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=baaro_media_probe");
    for flag in libs.split_whitespace() {
        if let Some(path) = flag.strip_prefix("-L") {
            println!("cargo:rustc-link-search=native={path}");
        } else if let Some(name) = flag.strip_prefix("-l") {
            println!("cargo:rustc-link-lib={name}");
        } else if flag == "-pthread" || flag.starts_with("-Wl,") {
            println!("cargo:rustc-link-arg={flag}");
        }
    }
}
